# Portal groups: self-service join, leave and requests

Date: 2026-09-17 · Branch: `portal-groups`

## Goal

Members see, on `/portal/groups`, the groups they are in and the groups they can
do something about — join, request to join, or ask a leader for — and act on
them without an admin. Leaders approve or decline requests from the group they
already manage. The page stays one page, arranged by category, building on the
directory shipped in commit `019e212`.

## Decisions taken during brainstorming

| Topic | Decision |
|---|---|
| Scope | `free_join_leave` join/leave **and** the full `request_to_join` workflow. |
| Storage | A `status` column on `group_memberships`, not a separate requests table. Every existing reader must filter `status = 'active'` (see audit below). |
| Approvers | Whoever `requireGroupManagementAccess(groupId)` admits: org admins, category admins of the group's category, group admins when the category's `groupAdminsManageMembers` is on. |
| Where | Existing `/portal/groups` page; per category, "your groups" then "groups on offer". |
| Hidden groups | `admin_only` groups the member is not in are hidden unless the category's new `showGroupsToNonMembers` is on; then they show with "ask a leader to add you". |
| Single-select categories | Joining another `free_join_leave` group **switches** (leaves the current one in one action, after a confirm). If the current group is not leavable, the switch is disabled with "ask a leader". |
| Leaving | Only `free_join_leave` groups. Group admins may leave; a dialog advises against it. Cannot leave the last group of a `selectionRequired` category. |
| Requests | Optional message. Re-request after a decline is allowed unless the approver blocked it (`requestsBlocked`). |
| Admin UI | Requests tab on the existing group detail; count badges; one line on the admin dashboard. No aggregate page. |
| Emails | Approvers on new request, member on decision. Two org-level toggles, default on, to save Resend quota. |

## 1. Data model

### `group_memberships`

New columns:

| Column | Type | Notes |
|---|---|---|
| `status` | enum `group_membership_status` (`active`, `pending`, `declined`) | `NOT NULL DEFAULT 'active'` — existing rows stay active. |
| `request_message` | `text NULL` | The member's note. Cleared on approval. |
| `requested_at` | `timestamptz NULL` | Set on request / re-request. |
| `decided_at` | `timestamptz NULL` | Set on approve / decline. |
| `decided_by_member_id` | `uuid NULL` FK `tenant_members.id ON DELETE SET NULL` | |
| `decline_reason` | `text NULL` | Optional, shown to the member. |
| `requests_blocked` | `boolean NOT NULL DEFAULT false` | Only meaningful when `status = 'declined'`. |

Indexes: keep the unique `(group_id, member_id)`; add `(org_id, group_id, status)` for the pending-count badges.

The unique index guarantees one row per member per group in any state, so the
row is **reused** across the lifecycle and its `id` is stable:

```
(none) ──request──▶ pending ──approve──▶ active
                      │  ▲                 │
                      │  └──re-request──┐  │
                   decline            declined (requests_blocked? no re-request)
                      │
             withdraw / leave / admin remove ──▶ (row deleted)
```

- `pending → active` clears `request_message`, sets `decided_*`.
- `pending → declined` sets `decided_*`, `decline_reason`, `requests_blocked`.
- `declined → pending` (re-request) clears `decided_*`, `decline_reason`, keeps `requests_blocked = false` (it must be false to get here), sets `request_message`, `requested_at`.
- An admin assigning a member who has a `pending` or `declined` row updates it to `active` instead of inserting (approval by another door). `assignGroupMemberAction`, `assignGroupMembersAction`, `member-admin` assignment, `group-registration` and `adopt-drift` all use one shared helper `upsertActiveMembership(tx, { orgId, groupId, memberId, role })`.

### `group_categories`

`show_groups_to_non_members boolean NOT NULL DEFAULT false`. Form label:
"Show groups to non-members" — "Members see this category's admin-only groups
on their portal and can ask a leader to add them."

### `organizations`

`email_notify_join_request boolean NOT NULL DEFAULT true` and
`email_notify_join_decision boolean NOT NULL DEFAULT true`.

### Audit: every reader of `group_memberships`

`server/queries/groups.ts` exports `activeMembership()` → `eq(groupMemberships.status, "active")`. Each site below adds it (or is explicitly exempt).

| File | Change |
|---|---|
| `lib/events/eligibility.ts` | Pure; callers pass only active rows (events.ts / forms.ts below). Add a comment. |
| `server/actions/groups.ts` | Reads: filter active. Inserts → `upsertActiveMembership`. Deletes (remove member/admin) unchanged. Role updates: only on active rows. |
| `server/actions/member-admin.ts` | Read: filter active. Insert → helper. |
| `server/actions/membership-reports.ts` | Filter active. |
| `server/lib/group-registration.ts` | Insert → helper. Delete unchanged. |
| `server/lib/member-data-export.ts` | Export active memberships; export pending/declined requests as their own section (GDPR: the message is the member's data). |
| `server/lib/member-datasets.ts` | Filter active. |
| `server/lib/member-management-scope.ts` | Filter active (both). |
| `server/lib/membership-report.ts` | Filter active (both). |
| `server/lib/payment-lifecycle.ts` | Filter active (both) — a requester must never be billed. |
| `server/lib/workspace/adopt-drift.ts` | Insert → helper. |
| `server/lib/workspace/group-links.ts` | Filter active — a requester must never be synced. |
| `server/lib/workspace/resolve-provision-fields.ts` | Filter active. |
| `server/notifications/recipients.ts` | Filter active (both). |
| `server/queries/access.ts` | Filter active (both) — a pending row must not grant group-admin scope. |
| `server/queries/events.ts` | Filter active. |
| `server/queries/forms.ts` | Filter active. |
| `server/queries/groups.ts` | Filter active in the roster; add the pending-count query. |
| `server/queries/members.ts` | Filter active (both). |
| `server/queries/membership-reports.ts` | Filter active. |
| `server/queries/payments.ts` | Filter active (both). |
| `server/queries/portal-dashboard.ts` | Filter active; add pending-request count. |
| `server/queries/portal-groups.ts` | Reads all statuses on purpose (it renders them). |
| `server/queries/workspace-group-drift.ts` | Filter active. |

A DB test asserts that a `pending` row is invisible to: roster, fee generation, event targeting, workspace link sync, notification recipients and management scope.

## 2. Portal page

`getPortalGroupsData` returns per category:

```ts
type PortalGroupCategory = {
  …existing…
  mine: PortalGroup[];        // active memberships, + `canLeave: boolean`, `leaveBlockedReason: string | null`
  available: PortalAvailableGroup[];
};

type PortalAvailableGroup = {
  id; name; description; leaders: PortalGroupPerson[];
  action:
    | { kind: "join" }
    | { kind: "switch"; from: { id: string; name: string } }
    | { kind: "request" }
    | { kind: "pending"; requestedAt: Date }
    | { kind: "declined"; decidedAt: Date; reason: string | null; canRequestAgain: boolean }
    | { kind: "ask_leader" }
    | { kind: "blocked"; reason: string };  // disabled button with copy
};
```

`resolveAvailableAction` is a pure function in `lib/groups/portal-actions.ts`
(unit-tested). Inputs: group policy, membership row (if any), category
`selectionMode` / `maxSelections` / `showGroupsToNonMembers`, the member's
active groups in the category with their policies. Rules, in order:

1. Row `pending` → `pending`. Row `declined` → `declined` (`canRequestAgain = !requestsBlocked`).
2. `admin_only` → `ask_leader` if `showGroupsToNonMembers`, else omit the group.
3. Single-select category and already in a group there: if that group is `free_join_leave` and this one is `free_join_leave` → `switch`; otherwise → `blocked` ("Ask a leader to switch you"). `request_to_join` in a single-select category you already belong to → `blocked` ("Leave your current group first" / "Ask a leader") — the request would be un-approvable.
4. Multi-select with `maxSelections` reached → `blocked` ("Leave a group first").
5. `free_join_leave` → `join`; `request_to_join` → `request`.

`canLeave` on `mine`: policy `free_join_leave` and not (`selectionRequired` and it is the only active group in the category). `leaveBlockedReason` carries the copy for the disabled state.

### UI (`components/app/portal/portal-groups.tsx`)

- Category section: `mine` cards as today, with a **Leave** item in an overflow menu on leavable cards. Then, when `available` is non-empty, a sub-heading "Groups you can join" and lighter cards (dashed ring, name, description, leaders, one action area). Cards with `ask_leader` render the leaders with mailto like the own-group cards.
- Empty `mine`: "You are not in a X group yet — pick one below." when `available` has a `join`/`request`; otherwise the existing "ask an admin" copy.
- Dialogs (`AlertDialog` / `Dialog`):
  - Join: none (single click) unless `switch`, which confirms "You will leave *A* and join *B*."
  - Request: dialog with optional textarea (max 500 chars) and submit.
  - Leave: confirm. If the viewer is a `group_admin` there: extra paragraph "You lead this group. If you leave, it may have no leader until an org admin appoints one." If they are the last admin, say so explicitly.
  - Withdraw: confirm.
- Pending: "Requested <date> · waiting for a leader" + Withdraw. Declined: "Declined <date>" + reason + Request again (or "Ask a leader" when blocked).
- Actions are `useAction` hooks with toast feedback and `router.refresh()`.
- Dashboard "My groups" tile: extra line "N requests waiting" when `pendingCount > 0`.

## 3. Actions — `server/actions/group-membership-requests.ts`

All `authActionClient`, `.metadata({ actionName })`, Zod schemas in `lib/groups.ts`
(`joinGroupSchema`, `leaveGroupSchema`, `requestToJoinGroupSchema` with `message: string max 500 → null`,
`withdrawJoinRequestSchema`, `decideJoinRequestSchema` with `decision`, `reason`, `blockFurtherRequests`,
`setJoinRequestBlockSchema`). Every action runs in one transaction and re-reads state inside it.

Member-side (`requireCurrentMemberAccess({ requireProfileComplete: true, requirePolicyAcknowledgement: true })`):

| Action | Preconditions | Effect |
|---|---|---|
| `joinGroupAction` | group active in org; policy `free_join_leave`; no row or `declined`; category rules per `resolveAvailableAction` = `join` or `switch` | upsert `active`/`member`; on `switch` delete the other row in the same transaction |
| `leaveGroupAction` | row `active`; `canLeave` | delete row |
| `requestToJoinGroupAction` | policy `request_to_join`; no row, or `declined` with `requestsBlocked = false`; category rules = `request` | upsert `pending`, message, `requestedAt`; notify approvers |
| `withdrawJoinRequestAction` | own row `pending` | delete row |

Approver-side (`requireGroupManagementAccess(groupId)`):

| Action | Preconditions | Effect |
|---|---|---|
| `approveJoinRequestAction` | row `pending` | `active`, `decidedAt/By`, clear request fields; notify member |
| `declineJoinRequestAction` | row `pending` | `declined`, reason, `requestsBlocked`; notify member |
| `setJoinRequestBlockAction` | row `declined` | toggle `requestsBlocked` |

Concurrency: two approvers on the same request — the second sees a non-pending row and gets "This request was already handled." Errors use the existing `ActionError` / `returnValidationErrors` pattern.

## 4. Admin UI

- `components/app/group-detail.tsx`: **Requests** tab, rendered when the group's policy is `request_to_join` or any non-active rows exist. Pending table: member (link), message, requested date, Approve / Decline. Decline opens a dialog: optional reason, "Block further requests" switch. Declined rows in a collapsed section with the block switch inline and the decision date/decider.
- Category detail group list and `/admin/groups` overview: pending count badge per group (`listPendingRequestCounts(orgId, groupIds)`).
- Admin dashboard: one todo line "N join requests waiting" (only groups from `listScopedGroupIds`), linking to the group when N belongs to one group, else to `/admin/groups`.
- Category form: the `showGroupsToNonMembers` switch (schema + action + form).
- Email notification settings card: "Join requests → leaders", "Join decisions → members".

## 5. Emails

- `emails/group-join-request-email.tsx` — to approvers: member name, group, message, link to the group's Requests tab.
- `emails/group-join-decision-email.tsx` — to the member: approved / declined, reason, link to `/portal/groups`.
- Approver routing reuses the registration-alert chain in `server/notifications/recipients.ts`: group `notificationEmail` → linked Workspace group when `notifyViaWorkspaceGroup` → group admins → category admins → org admins. Logged via `server/lib/email-activity.ts`. Skipped when the org toggle is off; failures are logged, never fail the action.

## 6. i18n

All new copy goes through `lib/i18n/messages.ts` (en + cs).

## 7. Testing

- `tests/portal-group-actions.test.ts` — `resolveAvailableAction` matrix: each policy × {no row, pending, declined, declined+blocked} × {single: none / free / admin_only current} × {multi: below / at max} × `showGroupsToNonMembers`.
- `tests/join-request-recipients.test.ts` — routing chain resolver.
- `tests/group-membership-status.test.ts` (DB, self-skipping) — transitions incl. switch, admin-assign-over-pending, decline+block → re-request refused, and the invisibility assertions from the audit.
- Manual checklist: portal card states, dialogs, admin tab, badges, dashboard lines, both email toggles.

## Out of scope

Aggregate requests page, request expiry, notifications to the member on withdraw, capacity limits on groups.
