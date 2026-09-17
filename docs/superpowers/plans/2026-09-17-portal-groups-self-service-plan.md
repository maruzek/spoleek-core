# Portal groups self-service — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-17-portal-groups-self-service-design.md`
**Date:** 2026-09-17 · **Branch:** `portal-groups`

Six phases, each ending in a green `pnpm typecheck && pnpm lint && pnpm test`
and a commit. Phases 1–3 have no UI. The invariant that governs every phase:
**a `pending` or `declined` row is invisible to everything that treats a
membership as real** — rosters, fees, event targeting, Workspace sync,
notification recipients, admin scope. Phase 2 makes that true and pins it with
a DB test before any code can create such a row.

Steps marked **[you]** embody a product decision with more than one valid
answer; the scaffold (file, signature, tests) is prepared first and the body
is left for you to write.

---

## Phase 1 — Schema and migration

**Files:** `server/db/schema.ts`, `server/db/migrations/*` (generated).

1. Add `groupMembershipStatusEnum = pgEnum("group_membership_status", ["active", "pending", "declined"])`
   next to `groupMembershipRoleEnum` (schema.ts ~L233). Doc-comment: `pending`
   and `declined` are join requests, not memberships; every reader filters
   `active` unless it renders requests.
2. `groupMemberships` (~L1182): add, after `role`:
   `status` (enum, `notNull().default("active")`), `requestMessage text`,
   `requestedAt timestamptz`, `decidedAt timestamptz`,
   `decidedByMemberId uuid` FK `tenantMembers.id` `onDelete: "set null"`,
   `declineReason text`, `requestsBlocked boolean notNull default false`.
   Add index `group_memberships_org_group_status_idx` on `(orgId, groupId, status)`.
   Extend the table doc-comment with the lifecycle from spec §1.
3. `groupCategories` (~L1083, next to `isPinnedToNavigation`): add
   `showGroupsToNonMembers boolean notNull default false`.
4. `organizations` (~L738, next to `emailNotifyRegistration`): add
   `emailNotifyJoinRequest` and `emailNotifyJoinDecision`, both
   `boolean notNull default true`.
5. Export `GroupMembershipStatus` type next to `GroupMembershipRole` (~L2665).
6. `pnpm db:generate`; read the SQL: enum created in its own statement, columns
   added with defaults so existing rows backfill to `active`, index created.
   `pnpm db:migrate`.

**Done when:** migration applies on fresh and seeded DB; typecheck green;
tests green (nothing else changed).

---

## Phase 2 — The `active` audit, the upsert helper, and the invisibility test

**Files:** `server/queries/groups.ts`, `server/lib/group-membership.ts` (new),
every file in spec §1 audit table, `tests/group-membership-status.test.ts`.
**Pattern for the DB test:** `tests/membership-report-freeze.test.ts` (connects
to local Postgres, skips itself when unreachable).

1. `server/queries/groups.ts`: export
   `export const activeMembership = () => eq(groupMemberships.status, "active");`
   with a one-line comment pointing at the spec audit.
2. `server/lib/group-membership.ts` (new): 
   ```ts
   export async function upsertActiveMembership(tx: DbTransaction, params: {
     orgId: string; groupId: string; memberId: string; role?: GroupMembershipRole;
   }): Promise<{ id: string; previousStatus: GroupMembershipStatus | null }>
   ```
   `INSERT … ON CONFLICT (group_id, member_id) DO UPDATE SET status='active',
   request fields → null, decided fields → null, requests_blocked=false, role =
   greatest of existing/new` (keep `group_admin` if already admin). Return the
   previous status so callers can tell "approved by assignment" from "new".
3. Walk the audit table in spec §1 top to bottom. For each file: add
   `activeMembership()` to every `where`/`on` that reads `groupMemberships`;
   replace every `insert(groupMemberships)` with `upsertActiveMembership`;
   leave deletes alone; in `server/actions/groups.ts` restrict the two role
   `update`s to active rows. `server/lib/member-data-export.ts`: add a
   `groupJoinRequests` section (group name, status, message, dates, reason)
   alongside memberships — update `tests/member-data-export.test.ts`.
   `server/queries/portal-groups.ts` is the one exemption; add a comment.
   `lib/events/eligibility.ts`: comment only.
4. `tests/group-membership-status.test.ts`: seed an org, one category, one
   `request_to_join` group, two members; insert a `pending` row by hand. Assert
   it is invisible to `listGroupMembers`, `listScopedGroupIds` /
   `requireGroupManagementAccess`'s underlying query, the fee-generation query
   in `payment-lifecycle`, event targeting (`listEventsForViewer` for a
   targeted event owned by the group), `resolveRegistrationRecipients`,
   `group-links` membership listing, and `member-management-scope`. Then
   `upsertActiveMembership` on that row → assert `previousStatus === "pending"`
   and it now appears everywhere. Also assert an `active` row upserted again
   keeps `group_admin`.

**Done when:** every site in the audit table is touched (grep
`groupMemberships` and confirm each read carries `activeMembership()` or a
comment saying why not); DB test green locally; all suites green.

---

## Phase 3 — Pure logic, schemas, actions, notifications

### 3a. Pure decision module

**Files:** `lib/groups/portal-actions.ts` (new), `tests/portal-group-actions.test.ts`.
**Pattern:** `lib/events/rsvp.ts` + `tests/events-rsvp.test.ts`.

1. Types from spec §2: `PortalAvailableAction`, plus the inputs:
   ```ts
   type Input = {
     group: { id; joinPolicy: GroupJoinPolicy };
     row: { status: GroupMembershipStatus; requestedAt; decidedAt; declineReason; requestsBlocked } | null;
     category: { selectionMode; maxSelections: number | null; selectionRequired; showGroupsToNonMembers };
     myActiveInCategory: Array<{ id; name; joinPolicy }>;
   };
   ```
2. `resolveAvailableAction(input): PortalAvailableAction | null` (null = omit).
   **[you]** — the ordered rules in spec §2 are the default reading; write the
   body. Two cells the spec leaves to your judgement: (a) a `declined` row in a
   single-select category where you have since been placed in another group —
   still show "declined", or hide it? (b) `showGroupsToNonMembers` off but you
   have a `pending`/`declined` row on an `admin_only` group (policy changed
   after you requested) — show the row's state or hide it? Pick one, encode it
   in a test.
3. `resolveLeave(group, category, myActiveInCategory): { canLeave: boolean; reason: string | null }`.
4. Tests: the full matrix from spec §7 as a table-driven `it.each`.

### 3b. Zod schemas

**File:** `lib/groups.ts`. Add `joinGroupSchema { groupId }`, `leaveGroupSchema`,
`requestToJoinGroupSchema { groupId, message: string trim max 500 → null }`,
`withdrawJoinRequestSchema`, `decideJoinRequestSchema { groupId, memberId,
decision: "approve" | "decline", reason (nullable, max 500), blockFurtherRequests: boolean default false }`,
`setJoinRequestBlockSchema { groupId, memberId, blocked }`. Add
`showGroupsToNonMembers: z.boolean().default(false)` to `groupCategorySchema`.
Update `groupJoinPolicyOptions[request_to_join].description` — the "will come
later" text is now wrong.

### 3c. Queries

**File:** `server/queries/groups.ts`.
- `listGroupJoinRequests(orgId, groupId)` → pending + declined rows joined to
  `tenantMembers` (name, email, status), ordered pending first, then by
  `requestedAt` desc; include decider name via a self-join alias.
- `listPendingRequestCounts(orgId, groupIds)` → `Map<groupId, number>`.
- `getGroupDetailData`: add `requests` from the first; `getCategoryDetailData`
  and `listGroupsByCategory`: add `pendingRequestCount` per group.

### 3d. Actions

**File:** `server/actions/group-membership-requests.ts` (new).
**Pattern:** `server/actions/groups.ts` (`assignGroupMemberAction` for the
guard + transaction shape, `ActionError` usage).

Implement the seven actions from spec §3. Each: `authActionClient`,
`.metadata`, schema from 3b, then inside `db.transaction`: lock the row with
`FOR UPDATE` (`tx.select().from(groupMemberships).where(...).for("update")`),
re-derive the allowed action via `resolveAvailableAction` / `resolveLeave` on
fresh data, refuse with a user-readable `ActionError` when the state moved.
`joinGroupAction` with `switch` deletes the other row in the same transaction.
After commit: `revalidatePath("/portal/groups")`, `/portal`, and for approver
actions `/admin/groups/[categoryId]/[groupId]` (copy the exact paths used by
`assignGroupMemberAction`). Notifications (3e) are called after commit and
wrapped in try/catch + `console.error` — never fail the action.

### 3e. Notifications and emails

**Files:** `server/notifications/recipients.ts`,
`server/notifications/group-join-requests.ts` (new),
`emails/group-join-request-email.tsx`, `emails/group-join-decision-email.tsx`,
`server/actions/organization-settings.ts`, `app/admin/settings/page.tsx`,
`components/app/email-notification-settings-card.tsx`.
**Pattern:** `server/notifications/registration.ts` +
`emails/registration-received-email.tsx`; routing in
`resolveRegistrationRecipients` (L71–) for the group/category chain.

1. `resolveJoinRequestRecipients({ orgId, groupId })`: return `[]` when
   `emailNotifyJoinRequest` is off; else group `notificationEmail` →
   Workspace group when `notifyViaWorkspaceGroup` → active group admins →
   category admins (when `groupAdminsManageMembers` is off, skip group admins
   entirely — they cannot act) → org admins. First non-empty tier wins. Pure
   tier-picking goes in `lib/groups/join-request-recipients.ts` and is
   unit-tested in `tests/join-request-recipients.test.ts`; the DB fetch stays
   in `recipients.ts`.
2. `notifyJoinRequested({ orgId, groupId, memberId, message })` and
   `notifyJoinDecided({ orgId, groupId, memberId, decision, reason })` in
   `group-join-requests.ts`; the second checks `emailNotifyJoinDecision`. Both
   go through `server/notifications/send.ts` and `recordNotificationEmail`.
3. Templates: copy the structure of `registration-received-email.tsx`; request
   email links to `/admin/groups/<categoryId>/<groupId>?tab=requests`, decision
   email to `/portal/groups`.
4. Settings: add the two booleans to the schema in `organization-settings.ts`
   (~L186/L223), the page props (~L102) and two `Switch` rows in the card,
   labels "Join requests → leaders" / "Join decisions → members".

**Done when:** all new tests green; a manual request via a temporary script
(or the DB test extended with the actions) produces one email row in
`email_activity`.

---

## Phase 4 — Portal UI

**Files:** `server/queries/portal-groups.ts`,
`components/app/portal/portal-groups.tsx`,
`components/app/portal/portal-group-actions.tsx` (new, client),
`server/queries/portal-dashboard.ts`, `components/app/portal/portal-dashboard.tsx`,
`lib/i18n/messages.ts`.

1. `getPortalGroupsData`: fetch **all** the member's rows (no status filter),
   feed `resolveAvailableAction` / `resolveLeave` per group, produce
   `mine` (+ `canLeave`, `leaveBlockedReason`, `isLastAdmin`) and `available`.
   `isLastAdmin` needs the group's active admin count — one extra grouped query
   over `myGroupIds`.
2. `portal-group-actions.tsx`: `JoinButton`, `SwitchDialog`, `RequestDialog`
   (textarea, 500 chars, counter), `WithdrawButton`, `LeaveMenuItem` +
   `LeaveDialog` (admin warning variants), `RequestAgainButton`. All use
   `useAction` + `toast` + `router.refresh()`, matching
   `components/app/policy-acknowledgement-form.tsx` for the hook shape.
3. `portal-groups.tsx`: overflow menu (`DropdownMenu`) on own cards with Leave;
   "Groups you can join" sub-list of `AvailableGroupCard` (dashed ring, no
   notices/next-event, leaders with mailto, one action slot rendering by
   `action.kind`). Two empty states per spec §2. Keep `reveal(index)`
   numbering continuous across both lists.
4. Dashboard: `getPortalDashboardData` adds `membership.pendingRequests: number`
   (count of `pending` rows); tile shows "N requests waiting" under the group
   list. Update `tests/portal-dashboard.test.ts` fixtures.
5. All strings via `lib/i18n/messages.ts`, en + cs.

**Done when:** every `action.kind` renders (use `pnpm db:seed` org plus a hand
edit of policies) and each button round-trips; typecheck/lint/test green.

---

## Phase 5 — Admin UI

**Files:** `components/app/group-detail.tsx`,
`components/app/group-join-requests-tab.tsx` (new),
`components/app/group-category-form.tsx`, `components/app/group-category-detail.tsx`,
`components/app/group-categories-admin.tsx`, `server/actions/groups.ts`
(category save picks up the new flag, L173/199/222/246),
`server/queries/dashboard.ts`, `components/app/dashboard/*`.

1. Requests tab (`TabsTrigger value="requests"`, after "admins", L324): render
   when `group.joinPolicy === "request_to_join" || requests.length > 0`; badge
   with pending count in the trigger. Support `?tab=requests` as
   `defaultValue` (the email deep link). Pending table (TanStack Table like the
   members tab): member link, message (line-clamp, title on hover), requested,
   Approve / Decline. Decline → `Dialog` with reason textarea + "Block further
   requests" `Switch`. Declined rows in a `Collapsible` "Declined (N)" with
   decided-by/at and the block `Switch` inline (`setJoinRequestBlockAction`).
2. Pending badge next to group names in `group-category-detail.tsx` and the
   overview.
3. Category form: `showGroupsToNonMembers` switch near `isPinnedToNavigation`
   (L608) with the spec copy; wire through save action.
4. Admin dashboard (`server/queries/dashboard.ts`, groups section ~L308):
   `attention.push` "N join requests waiting" for groups in
   `listScopedGroupIds`; href to the group when one group, else
   `/admin/groups`. Extend `tests/dashboard.test.ts`.

**Done when:** approve/decline from the tab flips the portal card state; badge
counts drop; dashboard line appears/disappears; green checks.

---

## Phase 6 — Seed, docs, hand-off

1. `pnpm db:seed` (`server/db/seed*.ts`): give the demo org one
   `free_join_leave` group, one `request_to_join` group with a pending and a
   declined request, and one category with `showGroupsToNonMembers`.
2. `docs/portal-groups-user-test.md` — manual checklist from spec §7, in the
   style of `docs/forms-user-test.md`.
3. Final `pnpm typecheck && pnpm lint && pnpm test`, commit.

---

## Order and dependencies

1 → 2 → 3a → 3b → 3c → 3d → 3e → 4 → 5 → 6. Phase 2 must land before 3d so
no action can create a `pending` row while any reader still treats it as a
membership. 3a and 3b are independent of each other; 4 and 5 are independent
once 3 is done and can be separate commits.
