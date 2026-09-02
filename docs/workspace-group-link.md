# Workspace group link — design & brainstorm

Status: P1 implemented on branch `workspace-groups-link`. P2/P3 below are still planned.

## 1. Where we are today

A minimal version already ships:

- `groups.workspaceGroupEmail` (free text) + `groups.workspaceOrgUnitPath`, set from the
  group form's "Workspace integration" fieldset (`components/app/group-form.tsx:388`).
- On `assignGroupMember` / `assignGroupMembers` / `removeGroupMember`
  (`server/actions/groups.ts:364,410,449`) we synchronously call
  `addWorkspaceGroupMember` / `removeWorkspaceGroupMember`.

That's a *push-on-write side effect*, not a link. Concrete gaps:

| # | Gap | Consequence |
|---|-----|-------------|
| 1 | Google call happens after the DB write, outside a transaction, with no retry | A 5xx or expired token leaves Spoleek and Google permanently divergent; the user just sees an action error |
| 2 | No backfill | Linking a group with 40 existing members syncs nobody until each membership is touched again |
| 3 | No unlink semantics | Clearing the field silently orphans everyone in the Google group |
| 4 | No drift detection | Anyone editing the Google group in the Admin console diverges forever |
| 5 | We store the **email**, not the immutable Google group `id` | Renaming the group in Google breaks the link with no error until a member changes |
| 6 | Push-only | Orgs that already run on Google Groups can't adopt Spoleek without re-keying membership |
| 7 | One group per Spoleek group; no role mapping | `group_admin` can't become a Google `MANAGER`; a group can't feed both `team@` and `all-staff@` |
| 8 | Members without `workspaceUserEmail` are silently skipped | Mailing list is quietly incomplete |
| 9 | No visibility | Nothing anywhere says whether a group is in sync |

## 2. Core model

Promote the link to a first-class row, and make membership sync a *reconciliation*
rather than a side effect.

### 2.1 `group_workspace_links`

```
id, orgId, groupId -> groups.id (cascade)
workspaceGroupId    text  -- immutable Google id, the real key
workspaceGroupEmail text  -- cached for display; refreshed on sync
direction           enum('push','pull','observe')     default 'push'
memberRole          enum('member','manager','owner')  default 'member'
adminRole           enum('member','manager','owner')  default 'manager'
removalPolicy       enum('remove_owned','remove_all','keep') default 'remove_owned'
includeExternal     boolean default false  -- push personal email when no workspace account
isEnabled           boolean default true
lastSyncedAt, lastSyncStatus, lastSyncError
unique (groupId)                  -- one Google group per Spoleek group
unique (orgId, workspaceGroupId)  -- one Spoleek group per Google group
```

`groups.workspaceGroupEmail` is dropped outright — there is no production data, so the local
dev DB gets wiped and reseeded rather than migrated.

**Directions.** Deliberately **no two-way**: without vector clocks "both ways" means "last
writer silently wins", and the failure mode (a member quietly reappearing after being removed)
is worse than making the user pick a master.

The direction is explained *in the form itself*, not in docs — a radio group with one line of
consequence copy each, so the admin never has to guess which system wins:

> **Spoleek manages this group** — People you add here are added to `board@`. Someone added
> directly in the Google Admin console shows up for review, and is never removed automatically.
> **Watch only** — Nothing in Google is changed. Differences between the two are listed for
> you to review.
> *(later)* **Google manages this group** — Membership in `board@` decides who is in this
> Spoleek group.

### 2.2 Provenance ledger — the key idea

`workspace_group_member_links (orgId, linkId, workspaceGroupId, address, addedBySpoleekAt, googleMembershipId)`

One row per membership **we** created. It buys three things:

- **Safe removal.** `remove_owned` removes an address only if we put it there. An address an
  admin added by hand in the console is reported as drift, never deleted. Worked example —
  `board@` contains alice and bob (Spoleek added both), carol (a Workspace admin added her in
  the console) and `partner@other.com` (an external subscriber). Alice leaves the Spoleek group:

  | policy | what reconcile does |
  |---|---|
  | `remove_all` | deletes alice, **and** carol and partner@ — Spoleek claims total ownership. The first time it silently drops an external subscriber, the admin stops trusting the integration. |
  | `keep` | deletes nothing. Ex-members accumulate in the Google group forever. Safe, useless. |
  | `remove_owned` | deletes alice (ledger says we put her there). carol and partner@ aren't ours → listed as drift for the admin to adopt, remove, or ignore. |

  On backfill, addresses already in Google that match the Spoleek desired set are **adopted**
  (ledger rows written) — that's the "Adopts 4" in the dry-run preview.
- **Safe unlink.** Unlinking offers "also remove the N memberships Spoleek created" with an
  exact count, instead of guessing.
- **Room to grow.** If links ever become many-to-one, the desired set becomes a union over
  every link to a `workspaceGroupId` and the ledger is what stops two Spoleek groups from
  fighting over it. Today links are strictly one-to-one, so the union is not built.

### 2.3 The reconciler

One pure function, everything else calls it:

```ts
computeGroupPlan(desired: Set<Address>, actual: WorkspaceMember[], owned: Set<Address>)
  -> { add: Address[]; remove: Address[]; roleChange: […]; drift: Address[] }
```

- `add` = desired − actual
- `remove` = (actual − desired) ∩ owned, subject to `removalPolicy`
- `drift`  = (actual − desired) − owned  → surfaced, not deleted
- `roleChange` = present in both, wrong Google role

Callers: link creation (preview), membership mutations (single-member fast path),
"Sync now", nightly cron. Pure ⇒ unit-testable without touching Google.

### 2.4 Durable execution — outbox

`workspace_sync_operations (id, orgId, linkId, op, address, attempts, nextAttemptAt, status, lastError)`

Membership actions enqueue in the **same transaction** as the `group_memberships` write, then
kick a drain via `after()`. A new `/api/internal/drain-workspace-sync` cron (join the two in
`vercel.json`) retries with exponential backoff. This fixes gap 1 and takes Google latency out
of the assign-member request path — assigning 200 members currently means 200 serial API calls
inside one action.

Idempotency: treat `409 duplicate` on add and `404` on remove as success.

### 2.5 Nightly reconcile

`/api/internal/reconcile-workspace-groups` walks enabled links, runs `computeGroupPlan`,
applies `add`/`remove` for `push` links, applies the inverse for `pull`, and records `drift`
rows for review. Cheap: `groups.list` + `members.list` per link.

## 3. UI

**Group settings tab** (`components/app/group-detail.tsx:420`) gets a "Workspace" section
replacing the single combobox:

- List of links, each a row: Google group name/email, direction badge, health badge
  (`In sync` / `12 pending` / `Drift (3)` / `Error`), last synced time.
- "Link a Google group" → the existing combobox, then a **dry-run preview** before saving:
  *"Adds 12 · Removes 3 · Adopts 4 · 5 members have no Workspace account."* Nothing mutates
  until confirm. This alone prevents most of the scary outcomes.
- Row menu: Sync now · Review drift · Settings (roles, removal policy) · Unlink.
- Unlink dialog states exactly what happens to the N owned memberships.

**Org-wide view**: a new **Groups** tab in `components/app/admin-settings-tabs.tsx`, alongside
join / membership / notifications / workspace. It holds group-level health and settings —
every link with its sync status, plus group-wide defaults. Explicitly *not* inside the
Workspace tab, which is already dense with connection state and provision fields; group health
is a different job done by a different person on a different cadence.

## 4. Clever things this unlocks

1. **Create the Google group from Spoleek.** "No group yet? Create `{slug}@domain`." Map join
   policy → `whoCanJoin`/`whoCanPostMessage` (`free_join_leave` → open, `admin_only` →
   invited-only, announce-only groups → members can't post). One click instead of the console.
2. **Category-level templates.** Put the link config on `group_categories` with an email
   pattern (`{category-slug}-{group-slug}@domain`). Every new group in "Teams" auto-creates and
   auto-links its Google group. For an org with 30 teams this is the whole feature.
3. **Nested groups instead of member fan-out.** Google Groups can contain groups. Link a
   *category* to a parent group and add each child group's address as a member of it —
   `all-teams@` stays correct forever with ~1 API call per group instead of one per person.
   Massively cheaper on quota and it survives membership churn.
4. **Drift inbox as a discovery tool.** Reuse the approval-board pattern from the member edit
   panel: "4 people are in `board@` but not in the Spoleek group" → *Adopt* (create the
   membership, matching by workspace email via `link-user-to-member.ts`) / *Remove* / *Ignore*.
   The integration becomes a way to find members you never entered.
5. **Pull mode as an importer.** An org already living in Google Groups links in `observe` or
   `pull` mode and bootstraps Spoleek structure from Google — a natural new source in the
   member import wizard (`components/app/member-import/`) alongside CSV.
6. **Real mailing lists.** `lib/mailing-list.ts` currently builds recipient lists client-side.
   For a linked group, "Email this group" can address the Google group instead — replies thread
   and archive in Workspace, and external members are reachable.
7. **External / shadow members.** `includeExternal` pushes the member's preferred email
   (`server/lib/preferred-email.ts`) when they have no Workspace account, so the list is
   actually complete. Guarded per link because it exposes personal addresses to the group.
8. **Offboarding signal.** Reconciliation already fetches Workspace users; a suspended or
   deleted Google account surfaces in Spoleek as "workspace account inactive" — a leaving
   signal the org otherwise learns about late.
9. **Role mapping.** `group_membership.role = group_admin` → Google `MANAGER`, so group admins
   can moderate their own list without a Workspace admin.
10. **Beyond groups.** A Google group address is also a grantee for Shared Drives and Calendar
    ACLs — once the link exists, "give this group access to X" is a small increment.

## 5. Risks / edges

- **Quota.** Directory API is rate-limited per project. Backfill must throttle (and prefer
  idea 3 where possible). The outbox gives a natural place to pace.
- **Renames.** Keying on `workspaceGroupId` fixes today's silent break; refresh the cached
  email each sync.
- **Archived Spoleek group** → disable links, never delete the Google group.
- **Deleted Google group** → mark link `error`, surface in UI, do not auto-unlink.
- **Members with no email at all** (shadow accounts, `tenantMembers.userId` nullable) must be
  counted and shown in the preview, not silently dropped.
- **Permissions.** Only org admins should edit links even where `groupAdminsManageMembers` lets
  group admins manage membership — a link changes Workspace state. `group-form.tsx` already has
  `canManageWorkspaceIntegration`; keep that gate.

## 6. Phasing

**P1 — make the existing feature trustworthy.** `group_workspace_links` (`push` + `observe`),
Google id as the key, provenance ledger, outbox + drain cron, backfill with dry-run preview,
unlink dialog, health badge, "Sync now". Drop `groups.workspaceGroupEmail`.

**P2 — make it self-healing.** Nightly reconcile, drift inbox with adopt/remove/ignore, role
mapping, removal policies, the Groups settings tab, `pull` direction.

**P3 — make it leverage.** Multiple links per group in the UI, category-level
auto-create/auto-link, nested groups, import wizard source, mailing-list-via-Google-address.

## 7. Decisions

- **Removal default `remove_owned`.** See the worked example in 2.2.
- **No `pull` in v1** — ship `push` + `observe`. `observe` plus a drift inbox with an *Adopt*
  button delivers most of pull's value while keeping every membership creation a human
  decision, so v1 never has to answer "a stranger's address appeared in the Google group — do
  we create a shadow member, invite them, or skip?". Pull also *deletes* Spoleek memberships,
  which touches fee and renewal state (`server/lib/payment-lifecycle.ts`,
  `managesMembershipFees`) — a much heavier consequence than deleting a Google membership.
  Promote to real `pull` in P2 once the drift inbox shows what admins actually click.
- **Strictly one-to-one, enforced in both directions** (2026-09-02). A Spoleek group has at
  most one Google group and a Google group is claimed by at most one Spoleek group, enforced by
  unique indexes and by a friendly pre-check in the actions. Many-to-one roll-ups (several
  Spoleek groups feeding `all-staff@`) are a real want but a separate, later feature — tracked
  in Linear. Until then the union logic is deliberately absent rather than dormant.
