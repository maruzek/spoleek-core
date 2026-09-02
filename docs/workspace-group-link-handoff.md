# Handoff — Workspace group link, P2 → `pull` / P3

You are continuing a feature that is **already half-built and committed**. Read this whole
file, then `docs/workspace-group-link.md` (the design doc), before writing any code.

- Branch: `workspace-groups-link`. P1 is commit `4d188cc` ("groups link v1"); the one-to-one
  enforcement and all of P2 except `pull` sit on top of it.
- Design doc: **`docs/workspace-group-link.md`** — sections 2 (model), 4 (ideas), 6 (phasing),
  7 (decisions already made and why). §6 defines P1/P2/P3. Do not re-litigate §7.
- There is no production database. The local dev DB can be wiped and reseeded; never write a
  data migration for legacy rows.

## What the feature is

Spoleek groups can be linked to Google Workspace groups. A link declares which system decides
membership, and Spoleek reconciles the two. The old implementation (a free-text
`groups.workspace_group_email` column plus a fire-and-forget API call on assign/remove) is
**gone** — replaced by a link table, a provenance ledger, a pure reconciler and an outbox.

## The three invariants — do not break these

1. **`computeGroupPlan` is pure.** No DB, no network, no clock. Every caller (link preview,
   membership mutation, "Sync now", and your new nightly cron) runs the same function so they
   cannot disagree. If you need more inputs, pass them in — do not query inside it.
2. **Links are strictly one-to-one, in both directions.** A Spoleek group has at most one
   Google group; a Google group is claimed by at most one Spoleek group. Enforced by unique
   indexes (`group_workspace_links_group_idx`, `group_workspace_links_org_target_idx`) and by
   `findConflictingLink` in the actions, which turns the constraint into a message naming the
   side that is taken. Many-to-one roll-ups are a separate future feature tracked in Linear —
   do not reintroduce union logic as a side effect of P2.
3. **Only remove what the ledger says Spoleek added** (`removal_policy = remove_owned`, the
   default). An address a Workspace admin added by hand is *drift*: reported, never deleted.

## P1 — what exists, file by file

### Database (`server/db/schema.ts`, migration `0026_smiling_mother_askani.sql`)

- Dropped `groups.workspace_group_email`. `groups.workspace_org_unit_path` is unrelated and stays.
- `group_workspace_links` — one link. Keyed on the **immutable `workspace_group_id`**, with
  `workspace_group_email` cached for display and refreshed on each sync (a rename in the Google
  console must not break the link). Columns: `direction` (`push` | `observe`), `member_role` /
  `admin_role` (`member` | `manager` | `owner`), `removal_policy`
  (`remove_owned` | `remove_all` | `keep`), `include_external`, `is_enabled`, `last_synced_at`,
  `last_sync_status` (`never` | `ok` | `error`), `last_sync_error`.
  Unique on `group_id` **and** on `(org_id, workspace_group_id)` — strictly one-to-one.
- `workspace_group_member_links` — the **provenance ledger**, one row per Google membership
  Spoleek created. Unique on `(link_id, address)`. Addresses are always stored lowercase.
- `workspace_sync_operations` — the **outbox**: `kind` (`add_member` | `remove_member` |
  `update_role`), `address`, `role`, `status`, `attempts`, `next_attempt_at`, `last_error`.

### Server logic

- **`server/lib/workspace/reconcile.ts`** — `computeGroupPlan({desired, actual, owned,
  removalPolicy})` → `{add, roleChange, adopt, remove, drift}`. Pure. Also `strongestRole`
  `normalizeAddress` (lowercase/trim), and `strongestRole` — currently unused by the service
  layer, kept because many-to-one roll-ups will need it.
- **`server/lib/workspace/group-links.ts`** — the service layer:
  - `resolveDesiredMembers(orgId, workspaceGroupId, overrideLink?)` — the roster of the one
    linked Spoleek group. `overrideLink` lets the link dialog preview an unsaved link without
    writing a placeholder row. Excludes members with status
    `deleted` / `archived` / `suspended`.
  - `loadOwnedAddresses(orgId, workspaceGroupId)` — the ledger, org-wide for that Google group.
  - `planLinkSync(link, extraLinks?)` — reads both sides, returns plan + skipped members.
    An `observe` link is planned with `removalPolicy: "keep"` so nothing is ever removed.
  - `applyPlan(link, plan)` — enqueues add/remove/role ops; `adopt` needs no API call and is
    written straight to the ledger.
  - `buildPlanRows(orgId, plan, skipped)` — flattens a plan into preview-table rows and
    resolves removed/drifting addresses back to Spoleek member names.
  - `enqueueMemberSyncForGroup(orgId, groupId, memberIds)` — the membership-mutation fast path.
    **DB-only, no Google calls**, so assigning 200 members is one query, not 200 round trips.
  - `createLinkForGroup(orgId, groupId, input)` — shared by the link dialog and group creation.
- **`server/lib/workspace/sync-queue.ts`** — `drainWorkspaceSyncOperations({limit, orgId,
  linkId})`. Exponential backoff (30s → 60min), 6 attempts, non-retryable 4xx fail immediately,
  429/401/5xx retry. Ledger rows are written on **confirmed success**, never at enqueue time.
  A link only flips to `ok` once nothing is outstanding (`markSettledLinks`).
  Also `countPendingOperations(orgId)`.
- **`server/lib/workspace/client.ts`** — added `getWorkspaceGroup`,
  `listWorkspaceGroupMembers` (paginated), `updateWorkspaceGroupMemberRole`; `addWorkspaceGroupMember`
  now takes a role. All group endpoints are called with the group **id**, not the email.
  409 on add and 404 on remove are treated as success (idempotency).
- **`server/queries/workspace-group-links.ts`** — `listGroupWorkspaceLinks(orgId, {groupId?})`
  with `pendingCount`, `failedCount`, `ownedCount` per link; `getGroupWorkspaceLink`.
- **`server/actions/workspace-group-links.ts`** — `preview` (dry run, writes nothing),
  `create`, `update`, `sync` (`apply: false` gives the same dry run), `delete` (offers to remove
  the exact `ownedCount` memberships, draining before the cascade). All gated by
  `requireWorkspaceLinkAccess` — org admin or leader, even in categories where group admins may
  manage the roster, because a link writes to Workspace.
- **`server/actions/groups.ts`** — all five membership mutations (assign one, assign many,
  remove, promote admin, demote admin) now call the local `syncGroupMembership` helper, which
  enqueues and drains via `after()`. Org-unit provisioning is unchanged and still inline.
  `saveGroupAction` creates a link when `workspaceLink` is present on a **create**.
- **`app/api/internal/drain-workspace-sync/route.ts`** — cron drain, every 10 min in
  `vercel.json`. Secret: `WORKSPACE_SYNC_CRON_SECRET`, falling back to `CRON_SECRET`
  (`lib/env.ts`). Copies the auth shape of `purge-deleted-members`.

### Shared client-safe module

- **`lib/workspace-group-links.ts`** — zod schemas (`workspaceLinkSettingsSchema` and the five
  action schemas), `defaultWorkspaceLinkSettings`, the option lists **with their consequence
  copy** (`{group}` is substituted with the Google address), `WorkspaceLinkPlanRow` +
  `workspaceLinkPlanActionMeta`, and `describeLinkHealth` (failed → pending → error → watching
  → never → in sync).
- **`lib/groups.ts`** — `groupSchema` gained an optional `workspaceLink` used only on create.

### UI

- **`components/app/workspace-link-fields.tsx`** — `WorkspaceGroupPicker` and
  `WorkspaceLinkSettingsFields`, shared by the link dialog, the settings dialog and the create
  form, so the choices are defined once. Removal policy / roles / `includeExternal` render only
  for `push`.
- **`components/app/workspace-link-preview-table.tsx`** — the dry-run table, styled after
  `components/app/member-import/step-preview.tsx`.
- **`components/app/group-workspace-links-card.tsx`** — the card in a group's Settings tab:
  link list with health badge, Sync now (shows the plan table), Settings dialog, destructive
  Unlink with an exact owned count, and the two-step link dialog (pick → settings → preview →
  confirm).
- **`components/app/group-links-settings-card.tsx`** — the org-wide health table under a new
  **Groups** tab in `components/app/admin-settings-tabs.tsx` (deliberately *not* inside the
  Workspace tab).
- **`components/app/group-form.tsx`** — old free-text combobox removed; shows the link section
  only when creating. **`group-sheet.tsx`**, **`group-category-detail.tsx`**,
  **`group-detail.tsx`** and the three pages under `app/admin/` just thread props through.

## P2 — what exists, file by file

### Database (`server/db/schema.ts`, migration `0028_wooden_martin_li.sql`)

- `workspace_group_drift` — one row per address that is in the Google group but not in the
  Spoleek roster. `status` is only `open` | `ignored`; there is deliberately **no `resolved`**.
  Adopting or removing deletes the row outright, so if the change never lands in Google the
  next reconcile puts the row back as `open` rather than hiding a failure behind a status.
  `member_type` carries Google's `USER` / `GROUP` / `CUSTOMER` so a nested group is never
  offered as a person to adopt. Unique on `(link_id, address)`.

### Server logic

- **`server/lib/workspace/drift.ts`** — `recordLinkDrift(link, plan.drift)` makes the stored
  set match what the reconciler just saw: seen rows are touched without disturbing `status`
  (so an "ignore" survives every pass), unseen rows are deleted. `clearLinkDrift` is the
  post-decision cleanup.
- **`server/lib/workspace/reconcile-links.ts`** — `reconcileWorkspaceLinks({limit, orgId,
  pauseMs})`. Walks enabled links least-recently-synced first, paces itself (250 ms between
  links, 100 links per run) because the Directory API is per-project rate-limited, applies the
  plan for `push` links, records drift for all of them, refreshes the cached group email, and
  drains at the end. A `WorkspaceNotConnectedError` is a *skip*, not an error — it must not
  overwrite the link's last real status.
- **`server/lib/workspace/adopt-drift.ts`** — `adoptDriftAddress(link, address)`. Matches an
  existing member (Workspace address beats personal address) or creates a `pending` one, named
  from the directory. **It refuses rather than adopting an address the desired set would not
  contain** — an external address on a link without `includeExternal`, an alias of another
  account, a member who syncs under a different address. Adopting one of those would write a
  ledger row for a non-desired address, and `remove_owned` would then delete it from Google:
  the exact opposite of the admin's intent. Each refusal returns a reason, surfaced per address
  as its own toast.
- **`server/lib/cron-auth.ts`** — `authorizeCronRequest`, shared by both workspace cron routes.
- **`app/api/internal/reconcile-workspace-groups/route.ts`** — nightly at `0 2 * * *` in
  `vercel.json`, `maxDuration = 300`.

### Reads and actions

- **`server/queries/workspace-group-drift.ts`** — `listWorkspaceGroupDrift(orgId, {groupId,
  includeIgnored})` resolves each address back to a member so the inbox reads as names, and
  `countOpenDriftByLink(orgId)` feeds the badges. `listGroupWorkspaceLinks` now returns
  `driftCount` alongside `pendingCount` / `failedCount` / `ownedCount`.
- **`server/actions/workspace-group-drift.ts`** — `adopt` / `remove` / `ignore`, all taking a
  list of drift ids so one row and "adopt all" are the same path. Access is checked once per
  link, not once per row. `remove` refuses on an `observe` link — that link's whole promise is
  that Spoleek never writes.
- `requireWorkspaceLinkAccess` moved out of the links action file into
  `server/queries/access.ts`; both action files use it.

### UI

- **`components/app/group-drift-inbox-card.tsx`** — the inbox, on the group's **Members** tab
  with a count badge on the tab trigger, styled after the approval board (`a1ba4d9`). Per-row
  Adopt / Remove / Ignore, "Adopt all", and a collapsible list of ignored addresses.
- Drift counts also render as a "N to review" status on the per-group link card and in the
  org-wide Groups settings table.

## Your job: what is left

1. **`pull` direction** — the one P2 item still unbuilt, and deliberately so: §7 says to let the
   drift inbox show what admins actually click first. Add `"pull"` to
   `workspaceLinkDirectionEnum` and to `workspaceLinkDirectionOptions` with its own consequence
   copy. The two hazards §7 records still stand: pull must answer "an unknown address appeared —
   create a shadow member, invite, or skip?" (the adopt rules in `adopt-drift.ts` are the
   obvious starting point), and it *deletes* Spoleek memberships, which touches fee/renewal
   state (`server/lib/payment-lifecycle.ts`, `managesMembershipFees`).
2. **P3** — design doc §6: multiple links per group, category-level auto-create/auto-link,
   nested groups, import wizard source, mailing-list-via-Google-address.

## Gotchas found the hard way

- `ComboboxEmpty` (Base UI `Combobox.Empty`) keys off an `items` prop we do not use, so it
  renders "not found" even when children exist. Render your own empty state conditionally.
  The same latent bug exists in any other hand-rendered combobox in this repo.
- `ItemTitle` applies `font-heading` (Fraunces, serif); anything nested inside it inherits that.
  Badges there need `font-sans`, and `line-clamp-none` if you want wrapping.
- A sticky `<thead>` does not reliably paint a `<tr>` background — put the background on the
  `<th>` cells, and make it opaque.
- Drizzle rejects a `readonly` tuple for `notInArray`; type such constants as `MembershipStatus[]`.
- Drizzle's `onConflictDoUpdate` `set` must reference `excluded.<column>` via raw `sql` when the
  value comes from the row being inserted; touching drift rows without clobbering `status`
  depends on it.
- `resolveDesiredMembers` prefers `workspaceUserEmail` and only falls back to the preferred
  personal address when `includeExternal` is on. Any new code that decides "is this address one
  Spoleek wants?" has to follow the same order or it will fight the reconciler.

## Conventions and verification

- pnpm, not npm. `pnpm typecheck` and `pnpm lint` must both be run before declaring done.
  **`pnpm lint` currently fails on 7 pre-existing errors** in `components/ui/*` and
  `lib/compose-refs.ts` — 67 problems total is the clean baseline. Make sure your files add none.
- Schema changes: edit `server/db/schema.ts` → `pnpm db:generate` → review the SQL → commit both.
- Mutations go through `authActionClient` / `orgAdminActionClient` from `lib/safe-action-auth.ts`
  with `.metadata({ actionName })` and a zod input schema. RBAC lives in `server/queries/access.ts`.
- Every query over tenant data filters by `orgId`. `tenant_members.userId` is nullable.
- The reconciler is trivially testable without a database — a 20-line script exercising
  `computeGroupPlan` against all three removal policies is the fastest way to check your changes.
