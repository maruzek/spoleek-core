# Portal group page

Date: 2026-09-18 · Branch: `portal-groups` · Builds on
`2026-09-17-portal-groups-self-service-design.md`.

## Goal

Every group gets a page in the portal, `/portal/groups/[slug]`, that a member
opens from the group card. It answers "what is this group doing, who leads it,
who is in it with me, what is waiting on me here" in one place, and gives
group admins a small notice board and a link list without sending them to the
admin area.

## Decisions taken during brainstorming

| Topic | Decision |
|---|---|
| Who can open the page | Active members of the group always. Every other signed-in member of the org when the *effective* page visibility is `all_members`: a category default, overridable per group. Otherwise the page does not exist for them (404). |
| Roster | Names and avatars of fellow active members, shown only to active members of the group, only when an org-level switch is on, with a per-member opt-out. No contact details. Legal basis: legitimate interest (Art. 6(1)(f)); the org's privacy policy must mention it. A consent-based directory with contact details is a separate later project (MAR-151 / MAR-35, see the comment above `valueVisibility` in `server/db/schema.ts`). |
| Events | Events owned by the group, plus events owned elsewhere whose audience includes the group, in a separate "also invited to" list. Both filtered by what the viewer may see. |
| Forms | Same shape as events: standalone forms owned by the group; event-attached forms appear under their event. |
| Extras | "Your standing" (role, member since, fee, notices); leader notice board (rich text via the existing Tiptap editor); links & resources; leader quick panel. |
| Architecture | One server-rendered route, one composed query that reuses the viewer-scoped event, form and payment queries and filters them to the group. No new eligibility SQL. |

## 1. Data model

### Visibility

| Table | Column | Notes |
|---|---|---|
| `group_categories` | `group_pages_visible_to_all_members boolean NOT NULL DEFAULT false` | Category default. Form label: "Group pages open to all members" — "Any signed-in member can open this category's group pages. Rosters stay members-only regardless." |
| `groups` | `page_visibility` enum `group_page_visibility` (`inherit`, `all_members`, `members_only`) `NOT NULL DEFAULT 'inherit'` | Per-group override. Group form: three-way select, the `inherit` label reads "Inherit from category (currently: open to all / members only)". |

### Roster

| Table | Column | Notes |
|---|---|---|
| `organizations` | `show_group_rosters boolean NOT NULL DEFAULT false` | Org switch on `/admin/settings`. Copy: "Members see the names of the other members in their own groups. Legal basis is the organization's legitimate interest — say so in your privacy policy. Contact details are never shown." |
| `tenant_members` | `hide_from_group_rosters boolean NOT NULL DEFAULT false` | Member opt-out on `/portal/profile`: "Do not list me in group rosters". Exported in the Art. 15 export (`server/lib/member-data-export.ts`). Does not remove a group admin from the leaders list — leadership is a role the org assigns, not personal data the member controls. |

A roster row is `{ id, name, image, role, isYou }`. `image` is `users.image`
through `tenant_members.userId`; null for shadow accounts. Nothing else —
no email, phone or custom field — ever leaves the query.

### Notice board

On `groups`: `announcement text NULL`, `announcement_updated_at timestamptz NULL`,
`announcement_updated_by_member_id uuid NULL` FK `tenant_members.id ON DELETE SET NULL`.

The value is sanitized HTML in the schema of `lib/policy-html.ts`
(`POLICY_ALLOWED_TAGS` / `POLICY_ALLOWED_ATTRIBUTES` / `POLICY_ALLOWED_SCHEMES`).
The action runs `sanitizePolicyHtml` on whatever arrives and stores `null`
when `isPolicyHtmlEmpty`. Limit 20 000 characters after sanitizing.

### Links & resources

New table `group_resources` (not `group_links` — `server/lib/workspace/group-links.ts`
already owns that name for the Workspace sync):

| Column | Type |
|---|---|
| `id` | uuid PK |
| `org_id` | uuid FK `organizations` cascade |
| `group_id` | uuid FK `groups` cascade |
| `label` | text NOT NULL, 1–80 chars |
| `url` | text NOT NULL, `http:`, `https:` or `mailto:` only, max 2000 |
| `sort_order` | integer NOT NULL DEFAULT 0 |
| timestamps | |

Index `(org_id, group_id, sort_order)`. Max 20 rows per group, enforced in
the action.

### Member since

No column. `decided_at ?? created_at` of the viewer's active row — the row is
reused across the request lifecycle, so `created_at` alone would date an
approved request from the day it was requested.

### Migration

`pnpm db:generate` produces: the enum, three `ALTER TABLE … ADD COLUMN` sets
with defaults (existing rows backfill), the new table and index. Nothing is
dropped.

## 2. Access

`resolveGroupPageAccess` in `lib/groups/portal-actions.ts`, pure and
unit-tested:

```ts
type GroupPageAccessInput = {
  rowStatus: GroupMembershipStatus | null;          // the viewer's row, any status
  group: { isActive: boolean; pageVisibility: GroupPageVisibility };
  category: { isActive: boolean; groupPagesVisibleToAllMembers: boolean };
};
type GroupPageAccess = {
  level: "member" | "visitor" | null;               // null = the page does not exist for this viewer
  effectiveVisibility: "all_members" | "members_only";
};
```

Rules, in order:

1. `effectiveVisibility` = group `pageVisibility` unless `inherit`, then the
   category flag.
2. Group or category inactive → `null` (even for members; the card is not
   shown either).
3. `rowStatus === "active"` → `member`.
4. `effectiveVisibility === "all_members"` → `visitor`. A `pending` or
   `declined` row is a visitor, never a member.
5. Otherwise `null`.

The route calls `notFound()` on `null` — not a 403, so a members-only page
does not confirm the group exists. `app/portal/layout.tsx` already runs
`requireCurrentMemberAccess({ requireProfileComplete, requirePolicyAcknowledgement })`,
so a visitor is always a real, active member of the org.

What each level sees:

| Section | member | visitor |
|---|---|---|
| Header: name, description, category, leaders with mailto | ✓ | ✓ |
| Action slot (join / request / pending / declined / ask leader / leave) | leave | from `resolveAvailableAction` |
| Announcement | ✓ | ✓ |
| Your standing | ✓ | – |
| Events: upcoming owned | ✓ | those the viewer is eligible for |
| Events: also invited to | ✓ | those the viewer is eligible for |
| Events: past | ✓ | – |
| Forms: open | ✓ | those the viewer may fill |
| Forms: past | ✓ | – |
| Resources | ✓ | ✓ |
| Roster | when org switch on | – |
| Leader panel | group admins | – |

## 3. Query — `server/queries/portal-group-detail.ts`

New file; `portal-groups.ts` is already 350 lines and stays the list page's
query.

```ts
export type GroupEventItem = ViewerEventItem & { relation: "owned" | "invited" };
export type GroupFormItem = ViewerFormItem & { submitted: boolean };

export type PortalGroupDetail = {
  access: "member" | "visitor";
  group: { id; slug; name; description; categoryId; categoryName; joinPolicy };
  leaders: PortalGroupPerson[];
  action: PortalAvailableAction | null;                       // visitors only
  standing: {
    role: GroupMembershipRole;
    memberSince: Date;
    canLeave: boolean;
    leaveBlockedReason: PortalLeaveBlockedReason | null;
    isLastAdmin: boolean;
    fee: { amount: number; currency: string; nextRenewal: Date;
           payment: { status: PaymentStatus; href: "/portal/payments" } | null } | null;
    notices: PortalGroupNotice[];
  } | null;                                                   // members only
  events: { upcoming: GroupEventItem[]; alsoInvited: GroupEventItem[]; past: GroupEventItem[] };
  forms: { open: GroupFormItem[]; past: GroupFormItem[] };
  announcement: { html: string; updatedAt: Date; updatedBy: string | null } | null;
  resources: Array<{ id: string; label: string; url: string }>;
  roster: Array<{ id; name; image: string | null; role; isYou }> | null;  // null = section hidden
  leaderPanel: { pendingRequests: number; memberCount: number; adminHref: string } | null;
};

export async function getPortalGroupDetail(params: {
  organization: Organization; memberId: string; slug: string;
}): Promise<PortalGroupDetail | null>;   // null → notFound()
```

Sources:

- Group + category by `(orgId, slug)`; the viewer's row (any status);
  `resolveGroupPageAccess`.
- Leaders, notices and next-event logic move out of `portal-groups.ts` into
  `server/lib/portal-group-summaries.ts` (`loadLeadersByGroup`,
  `buildNoticesByGroup`, `buildNextEventByGroup`) so the card and the page
  compute them the same way. `portal-groups.ts` is refactored to call them;
  its output does not change.
- Events: `listEventsForViewer({ orgId, memberId })`, then per bucket:
  `upcoming` = `invited ∪ open` with `ownerGroupId === group.id` and
  `startsAt >= now` (or no `startsAt`), soonest first; `alsoInvited` =
  `invited ∪ open` with a different owner whose audience rules include this
  group (`listEventAudience` batched over the candidate ids via one `inArray`
  query on `eventAudience`), soonest first; `past` = `viewerEvents.past` with
  `ownerGroupId === group.id`, newest first. Visitors get `past = []`.
- Forms: `listFormsForViewer`, standalone (`event === null`) with
  `ownerGroupId === group.id`; `open` = accepting submissions, `past` = the
  rest that the viewer submitted. Event-attached forms are not listed here —
  the event row links to the event page which already shows them. Visitors
  get `past = []`.
- Fee: when the category `managesMembershipFees` and the group has
  `feeAmount`: next renewal from `feeRenewalMonth/Day`; `payment` = the
  viewer's live membership-fee payment for this group from
  `listPaymentsForMember`, if any.
- Roster: only when `access === "member"` and `organization.showGroupRosters`;
  active rows, `tenantMembers.status = 'active'`, `hideFromGroupRosters = false`,
  left-joined to `users` for `image`; admins first, then last name.
- Leader panel: when the viewer's row is `active` + `group_admin` (or they
  hold category/org admin over it — use `requireGroupManagementAccess`'s
  underlying check, not the role alone): `listPendingRequestCounts` for this
  group, active member count, `adminHref = /admin/groups/${categoryId}/${id}`.

## 4. Actions — `server/actions/group-page.ts`

All `authActionClient` + `.metadata({ actionName })`, schemas in `lib/groups.ts`.

| Action | Schema | Guard | Effect |
|---|---|---|---|
| `updateGroupAnnouncementAction` | `{ groupId, html: string }` | `requireGroupManagementAccess(groupId)` | `sanitizePolicyHtml`; empty → all three columns null; else set html, `announcementUpdatedAt = now`, `announcementUpdatedByMemberId = viewer` |
| `saveGroupResourcesAction` | `{ groupId, resources: Array<{ id?: uuid; label; url }> }` (max 20) | same | one transaction: delete rows not in the list, update rows with an id, insert the rest, `sortOrder` = array index |
| `setHideFromGroupRostersAction` | `{ hidden: boolean }` | `requireCurrentMemberAccess` | update own `tenant_members` row |

Existing actions gain fields: `saveGroupAction` / `groupSchema` →
`pageVisibility`; `saveGroupCategoryAction` / `groupCategorySchema` →
`groupPagesVisibleToAllMembers`; organization settings → `showGroupRosters`.

Revalidate `/portal/groups`, `/portal/groups/[slug]`, `/portal`, and the admin
group page, following the exact paths already used in
`server/actions/group-membership-requests.ts`.

## 5. UI

### Portal

`app/portal/groups/[slug]/page.tsx` → `components/app/portal/portal-group-page.tsx`
(server component) composed of sections; client islands only where there is
interaction.

1. **Header** — breadcrumb "Groups › {category}", name, description, leader
   row (the same `PortalGroupPerson` list the card renders, with mailto),
   role badge ("You lead this group" / "Member"), and one action slot. Members
   get the Leave item; visitors get the `resolveAvailableAction` button — all
   reused from `portal-group-actions.tsx`.
2. **Announcement** — card with the sanitized HTML (`dangerouslySetInnerHTML`
   inside the existing `prose` styling used for policies), "Updated {date} by
   {name}". Managers see "Edit" → `Sheet` with
   `components/app/rich-text-editor.tsx`: `PolicyEditor` generalised and
   renamed; `PolicyEditor` remains as a one-line re-export so the legal pages
   do not move. Save → `updateGroupAnnouncementAction`, toast, `router.refresh()`.
3. **Your standing** — members only. Role, "Member since {date}", fee line
   ("{amount} yearly · renews {date} · paid / due / overdue" linking to
   `/portal/payments`) when applicable, then the notices list reusing the
   card's notice rows.
4. **Events** — "Upcoming" list; "Also invited to" list only when non-empty,
   with the owner name on each row; "Past" in a `Collapsible`, first 20 rows,
   "Show all" reveals the rest. Rows reuse the event row from
   `/portal/events` (title, date, RSVP badge, link to `/portal/events/[slug]`).
5. **Forms** — open forms with "Fill in" / "Submitted" state; past in a
   `Collapsible`. Rows reuse the row from `/portal/forms`.
6. **Resources** — plain link list, `rel="noopener noreferrer"`. Managers see
   "Manage" → `Sheet` with a TanStack Form field array: label + url per row,
   up/down reorder buttons, remove, add (disabled at 20).
7. **Members** — members only, org switch on. Avatar (`Avatar` primitive,
   initials fallback) + name grid, leaders first with a "Leader" badge.
   Footer: "Not seeing someone? They chose not to be listed. You can change
   your own listing in your profile." Section still renders with only the
   viewer when everyone else opted out.
8. **Leader panel** — managers only, at the top under the header: "{n}
   requests waiting" (link to `?tab=requests`), "{n} members", "Open in
   admin".

Links to the page: group name on own cards and on available cards when
`resolveGroupPageAccess` is `visitor`; the dashboard "My groups" tile lists
names as links.

Empty states: no events → "Nothing planned yet."; no forms → section hidden;
no announcement → hidden for members, managers see a dashed "Write a notice
for the group" placeholder; no resources → hidden for members, managers see
"Add links".

### Admin

- `components/app/group-form.tsx`: `pageVisibility` select with the
  "currently: …" hint.
- `components/app/group-category-form.tsx`: `groupPagesVisibleToAllMembers`
  switch next to `showGroupsToNonMembers`.
- `/admin/settings` membership card: `showGroupRosters` switch with the
  legitimate-interest copy from §1.
- `components/app/group-detail.tsx`: a **Page** tab holding the announcement
  editor and the resources editor (same client components as the portal) and
  a "View as member" link to `/portal/groups/[slug]`.
- `/portal/profile`: `hideFromGroupRosters` switch.

### i18n

All copy through `lib/i18n/messages.ts`, en + cs.

## 6. Testing

- `tests/portal-group-page-access.test.ts` — `resolveGroupPageAccess`
  matrix: row {none, pending, declined, active} × group {inherit,
  all_members, members_only} × category flag {on, off} × {group inactive,
  category inactive}.
- `tests/portal-group-detail.test.ts` — the pure bucketing helpers (events
  owned / invited / past, form open / past, the 20-row cap boundary) over
  fixture arrays; the helpers are exported from
  `lib/groups/portal-group-page.ts` so the test needs no DB.
- `tests/member-data-export.test.ts` — `hideFromGroupRosters` present in the
  export.
- `tests/portal-dashboard.test.ts` — tile links carry the slug.
- `docs/portal-groups-user-test.md` — new section: each visibility
  combination as member / visitor / outsider, roster on/off/opt-out,
  announcement round-trip incl. a pasted `<script>`, resources reorder and
  the 20 cap, fee line for a priced group.

## Out of scope

Contact details or custom fields on the roster and any consent-based
directory (separate project); comments or reactions on announcements;
announcement history; ICS feeds; photos; per-member roster visibility beyond
the single opt-out; showing the page to unauthenticated users.
