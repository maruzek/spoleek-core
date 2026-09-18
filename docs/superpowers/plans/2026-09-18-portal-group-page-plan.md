# Portal group page — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-18-portal-group-page-design.md`
**Date:** 2026-09-18 · **Branch:** `portal-groups`

Five phases, each ending in a green `pnpm typecheck && pnpm lint && pnpm test`
and a commit. Phases 1–3 have no portal UI. The invariant that governs every
phase: **nothing about another member leaves the server except name, avatar
and role, and only to active members of the same group when the org switch is
on.** Phase 2 pins the access function with a test before any route exists.

One deviation from the spec, found while planning: `PolicyEditor` is already
reused as-is by `components/app/events/event-description-editor.tsx`, so no
rename is needed — the announcement editor wraps `PolicyEditor` the same way.

---

## Phase 1 — Schema and migration

**Files:** `server/db/schema.ts`, `server/db/migrations/*` (generated).

1. Add `groupPageVisibilityEnum = pgEnum("group_page_visibility", ["inherit", "all_members", "members_only"])`
   next to `groupJoinPolicyEnum`. Doc-comment: `inherit` resolves to the
   category's `groupPagesVisibleToAllMembers`; the resolver is
   `resolveGroupPageAccess`.
2. `groupCategories` (~L1109, after `showGroupsToNonMembers`):
   `groupPagesVisibleToAllMembers boolean notNull default false`.
3. `groups` (~L1183, after `notificationEmail`): `pageVisibility` (enum,
   `notNull().default("inherit")`), `announcement text`,
   `announcementUpdatedAt timestamptz`, `announcementUpdatedByMemberId uuid`
   FK `tenantMembers.id` `onDelete: "set null"`. Doc-comment on
   `announcement`: sanitized HTML in the `lib/policy-html.ts` schema; never
   render unsanitized input.
4. `organizations` (~L738, near `emailNotifyRegistration`):
   `showGroupRosters boolean notNull default false`.
5. `tenantMembers`: `hideFromGroupRosters boolean notNull default false`.
6. New table `groupResources` after `groupMemberships`: columns from spec §1,
   index `group_resources_org_group_sort_idx (orgId, groupId, sortOrder)`.
   Export `GroupResource` / `NewGroupResource` types and add the table to the
   schema export list (~L2698) and `GroupPageVisibility` type next to
   `GroupJoinPolicy`.
7. `pnpm db:generate`; read the SQL: enum, five `ADD COLUMN`s with defaults,
   `CREATE TABLE group_resources`, index, FKs. `pnpm db:migrate`.

**Done when:** migration applies on fresh and seeded DB; typecheck green.

---

## Phase 2 — Pure logic and schemas

### 2a. Access resolver

**Files:** `lib/groups/portal-actions.ts`, `tests/portal-group-page-access.test.ts`.

1. Add `GroupPageAccessInput`, `GroupPageAccess` and `resolveGroupPageAccess`
   from spec §2, rules in the stated order. Also export
   `resolveEffectiveVisibility(group, category)` separately — the group form
   uses it for the "currently: …" hint.
2. Test: table-driven `it.each` over row {null, pending, declined, active} ×
   group {inherit, all_members, members_only} × category flag {on, off}, plus
   the two inactive cases returning `null` even for an active row.

### 2b. Bucketing helpers

**Files:** `lib/groups/portal-group-page.ts` (new), `tests/portal-group-detail.test.ts`.

Pure functions over already-fetched arrays so the query stays thin and the
rules are testable without a DB:

```ts
export const PAST_EVENTS_CAP = 20;
export function bucketGroupEvents(params: {
  groupId; now: Date;
  viewer: { invited: ViewerEventItem[]; open: ViewerEventItem[]; past: ViewerEventItem[] };
  invitedEventIds: Set<string>;   // events whose audience includes the group
  access: "member" | "visitor";
}): { upcoming: GroupEventItem[]; alsoInvited: GroupEventItem[]; past: GroupEventItem[] };

export function bucketGroupForms(params: {
  groupId; items: ViewerFormItem[]; access;
}): { open: GroupFormItem[]; past: GroupFormItem[] };

export function nextFeeRenewal(group: { feeRenewalMonth; feeRenewalDay }, now: Date): Date | null;
export function memberSince(row: { decidedAt: Date | null; createdAt: Date }): Date;
```

Tests: owned vs invited split, `startsAt` null counts as upcoming, past
sorted newest first and **not** capped in the helper (the cap is a UI
"show all"), visitors get empty `past`, form open/past split, renewal date
rolls to next year when this year's date has passed, `memberSince` prefers
`decidedAt`.

### 2c. Zod schemas

**File:** `lib/groups.ts`.

- `groupSchema`: `pageVisibility: z.enum(["inherit","all_members","members_only"]).default("inherit")`.
- `groupCategorySchema`: `groupPagesVisibleToAllMembers: z.boolean().default(false)`.
- `updateGroupAnnouncementSchema { groupId: uuid; html: string max 20000 }`.
- `groupResourceSchema { id: uuid optional; label: trim 1–80; url: trim max 2000, refine scheme http/https/mailto }`,
  `saveGroupResourcesSchema { groupId; resources: array max 20 }`.
- `setHideFromGroupRostersSchema { hidden: boolean }`.
- Export `groupPageVisibilityOptions` (label + description per value) beside
  `groupJoinPolicyOptions`.

**Done when:** both new test files green; typecheck green.

---

## Phase 3 — Queries and actions

### 3a. Shared summaries

**Files:** `server/lib/portal-group-summaries.ts` (new), `server/queries/portal-groups.ts`.

Extract from `getPortalGroupsData`, unchanged in behaviour:

- `loadLeadersByGroup({ organization, groupIds, viewerMemberId }) → Map<groupId, PortalGroupPerson[]>` (the `leaderRows` query + mapping).
- `loadAdminCountByGroup(orgId, groupIds) → Map<groupId, number>`.
- `buildGroupNotices({ organization, viewerEvents, payments, now }) → { noticesByGroup, nextEventByGroup }` (the payment + RSVP loops).

`portal-groups.ts` calls them; move `PortalGroupPerson` / `PortalGroupNotice`
types to the new file and re-export from `portal-groups.ts` so existing
imports keep working. Run the existing tests — nothing else should change.

### 3b. Detail query

**File:** `server/queries/portal-group-detail.ts` (new). Implements
`getPortalGroupDetail` per spec §3:

1. One query: group joined to category by `(orgId, slug)`; return `null` if
   missing. Viewer's row (any status). `resolveGroupPageAccess` → `null` →
   return `null`.
2. In parallel: `loadLeadersByGroup`, `listEventsForViewer`,
   `listFormsForViewer`, `listPaymentsForMember`, and (members only)
   `loadAdminCountByGroup`; (managers) `listPendingRequestCounts` + active
   member count.
3. Invited-event ids: one `select eventId from eventAudience where orgId and
   kind = 'group' and groupId = group.id and eventId in (candidates)`. Check
   the exact `eventAudience` column names at `server/db/schema.ts` ~L2170
   before writing it.
4. `bucketGroupEvents`, `bucketGroupForms`, `buildGroupNotices` (filtered to
   this group), fee from `nextFeeRenewal` + the viewer's live membership-fee
   payment for this group (`listPaymentsForMember` rows with
   `type === "membership_fee"` and matching `groupId` — confirm the field
   names in `server/queries/payments.ts`).
5. Roster only when `access === "member" && organization.showGroupRosters`:
   `groupMemberships` + `activeMembership()` join `tenantMembers`
   (`status = 'active'`, `hideFromGroupRosters = false`) left join `users`
   for `image`; order admins first, then `lastName, firstName`. Select
   **only** `id, firstName, lastName, image, role`.
6. Manager check: reuse the underlying helper of
   `requireGroupManagementAccess` (find the non-throwing variant in
   `server/queries/access.ts`; add `canManageGroup(context, groupId): Promise<boolean>`
   if only the throwing one exists).
7. `action` for visitors via `resolveAvailableAction` with the same inputs
   `portal-groups.ts` builds (category selection fields + the viewer's active
   groups in the category — one small extra query).
8. Resources: `groupResources` by `(orgId, groupId)` ordered by `sortOrder`.
   Announcement author name via `tenantMembers` when
   `announcementUpdatedByMemberId` is set.

### 3c. Actions

**File:** `server/actions/group-page.ts` (new). Pattern:
`server/actions/group-membership-requests.ts`.

- `updateGroupAnnouncementAction`: `requireGroupManagementAccess(groupId)`,
  `sanitizePolicyHtml`, `isPolicyHtmlEmpty` → nulls, else set html + audit
  columns.
- `saveGroupResourcesAction`: guard; transaction: load existing ids for the
  group, delete those absent from input, update rows whose `id` is present
  and belongs to this group/org (ignore foreign ids → `ActionError`), insert
  the rest; `sortOrder = index`.
- `setHideFromGroupRostersAction`: `requireCurrentMemberAccess`, update own
  row.
- `saveGroupAction` (`server/actions/groups.ts` ~L265): persist
  `pageVisibility`. `saveGroupCategoryAction` (L175/202/226/251, the four
  `showGroupsToNonMembers` sites): persist `groupPagesVisibleToAllMembers`.
  `server/actions/organization-settings.ts`: `showGroupRosters`.
- Revalidate: `/portal/groups`, `/portal/groups/${slug}`, `/portal`,
  `/admin/groups/${categoryId}/${groupId}` — the group's slug is loaded
  inside the action for the path.

### 3d. Data export

`server/lib/member-data-export.ts`: add `hideFromGroupRosters` to the
profile section; extend `tests/member-data-export.test.ts`.

**Done when:** all suites green; a manual `tsx` script (scratchpad) calling
`getPortalGroupDetail` for the seeded org prints a populated object for a
member and `null` for an outsider of a members-only group.

---

## Phase 4 — Portal UI

**Files:** `app/portal/groups/[slug]/page.tsx` (new),
`components/app/portal/portal-group-page.tsx` (new, server),
`components/app/portal/group-announcement-editor.tsx` (new, client),
`components/app/portal/group-resources-editor.tsx` (new, client),
`components/app/portal/portal-groups.tsx`, `components/app/portal/portal-dashboard.tsx`,
`server/queries/portal-dashboard.ts`, `app/portal/profile/page.tsx`,
`components/app/profile-form.tsx`, `lib/i18n/messages.ts`.

1. Route: `requireCurrentMemberAccess` (copy the options from
   `app/portal/groups/page.tsx`), `getPortalGroupDetail`, `notFound()` on
   null, `AppPage` with eyebrow = category name, title = group name.
   `generateMetadata` for the title.
2. `portal-group-page.tsx`: sections in spec §5 order. Reuse
   `PortalEventsAgenda` rows (check its props — if it only takes buckets,
   extract an `EventRow` from it) and `PortalFormsList` rows the same way.
   Announcement rendered with `className="policy-prose"` +
   `dangerouslySetInnerHTML` exactly as `portal-event-detail.tsx:170`.
   Roster uses `components/ui/avatar` with initials fallback.
   Past events: render the first `PAST_EVENTS_CAP`, "Show all (N)" is a
   client `Collapsible` toggle.
3. `group-announcement-editor.tsx`: `Sheet` + `PolicyEditor` (as
   `event-description-editor.tsx` does) + `useAction(updateGroupAnnouncementAction)`
   + toast + `router.refresh()`. Hook shape from
   `components/app/policy-acknowledgement-form.tsx`.
4. `group-resources-editor.tsx`: `Sheet` + TanStack Form field array
   (`form.Field name="resources" mode="array"`), rows of label + url,
   up/down/remove, add disabled at 20, `useAction(saveGroupResourcesAction)`.
5. Links: in `portal-groups.tsx` wrap the group name in `<Link href={/portal/groups/${slug}}>`
   on own cards always, on available cards only when `canOpenPage` — add
   `slug` and `canOpenPage: boolean` to `PortalGroup` / `PortalAvailableGroup`
   in `portal-groups.ts` (computed with `resolveGroupPageAccess`).
   Dashboard: `getPortalDashboardData` adds `slug` per group; the tile lists
   names as links. Update `tests/portal-dashboard.test.ts` fixtures.
6. Profile: `hideFromGroupRosters` `SwitchChoiceField` in `profile-form.tsx`
   wired to `setHideFromGroupRostersAction`; only rendered when
   `organization.showGroupRosters` (pass the flag from the page).
7. All strings via `lib/i18n/messages.ts`, en + cs.

**Done when:** with `pnpm db:seed:groups`, the page renders for a member,
a visitor and 404s for an outsider; editors round-trip incl. a pasted
`<script>` being stripped; roster hides an opted-out member; checks green.

---

## Phase 5 — Admin UI, seed, docs

**Files:** `components/app/group-form.tsx`, `components/app/group-category-form.tsx`,
`components/app/membership-settings-card.tsx`, `app/admin/settings/page.tsx`,
`components/app/group-detail.tsx`, `server/db/seed*.ts`,
`docs/portal-groups-user-test.md`.

1. Group form (~L309, after `joinPolicy`): `pageVisibility` `Select` from
   `groupPageVisibilityOptions`; the `inherit` label appends
   "(currently: …)" via `resolveEffectiveVisibility` — pass the category's
   flag into the form props.
2. Category form (~L621, after `showGroupsToNonMembers`):
   `groupPagesVisibleToAllMembers` switch with the spec copy.
3. Membership settings card: `showGroupRosters` `SwitchChoiceField` with the
   legitimate-interest copy; page props + `organization-settings.ts` schema
   already done in 3c.
4. `group-detail.tsx` (~L372, before "report"): **Page** tab holding
   `GroupAnnouncementEditor` and `GroupResourcesEditor` inline (not in a
   Sheet — pass a `variant="inline"` prop) and a "View as member" link to
   `/portal/groups/[slug]`.
5. Seed (`pnpm db:seed:groups`): give one demo group an announcement, three
   resources and `pageVisibility = all_members`; set the demo org
   `showGroupRosters = true`; mark one member `hideFromGroupRosters`.
6. `docs/portal-groups-user-test.md`: append the checklist from spec §6.
7. Final `pnpm typecheck && pnpm lint && pnpm test`, commit.

---

## Order and dependencies

1 → 2a/2b/2c (independent of each other) → 3a → 3b → 3c → 3d → 4 → 5.
3a must land before 3b so the page and the card share one notice/leader
implementation. 4 and 5 are independent once 3 is done and can be separate
commits.
