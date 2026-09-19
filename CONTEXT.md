# Domain glossary

Names for the concepts this codebase is built around. Architecture reviews
and refactors use these names; when a module is named after a concept, the
concept lives here.

## Access

- **Viewer** — the signed-in user as the access rules see them, resolved once
  per request: account, system role, the organization, their member record
  (never a deleted one) and their *scope* — the categories they hold a
  category-admin assignment for and the groups they are an active group admin
  of. Every access rule is a pure predicate over a Viewer
  (`lib/access/viewer.ts`): `canManageGroup`, `canManageCategory`,
  `canManageOwner` (event and form owners), `getCapabilities`. The throwing
  guards in `server/queries/access.ts` and the safe-action middleware
  (`ctx.viewer`) are one-liners over those predicates; pages get a Viewer from
  `requireViewer()`, tests build one by hand. A Viewer is never re-resolved
  inside a guard — it is passed in.

## Payments

- **Payment scope** — what a viewer may see *and* act on in the payments
  dashboard, as one value: `full`, or a pair of allowlists
  `{ memberIds, eventIds }`. Membership-fee payments are in scope through the
  member (member of a group the viewer manages); event payments are in scope
  through the event (event owned by a group or category the viewer manages)
  *or* through the member (the responder is a scoped member).
  Seeing and acting differ: a viewer *acts* on (marks paid, cancels,
  refunds) a membership fee through the member and an event payment through
  the event only — a member's row on an event the viewer does not manage is
  visible but read-only.
  An empty allowlist means *nothing on that axis* — never "no filter".
  Two doors produce a scope: the `canManagePayments` capability (dashboard)
  and event management (the event's response list yields a scope limited to
  that one event). Both feed the same list query and the same mutations.

## Groups

- **Selection limit** — a Group Category's rule for how many of its groups
  one member may be active in at once: exactly one (`single`), or at most
  `maxSelections` (`multiple`, `null` = unlimited). A member's `group_admin`
  row counts like any other active row; join *requests* (`pending`,
  `declined`) do not count. The rule is one pure function
  (`lib/groups/selection-limit.ts` `resolveSelectionViolation`) and is
  enforced in exactly one place: `upsertActiveMembership`, the only writer of
  active memberships, which refuses the write with `GroupMembershipError`.
  Callers that *move* a member between groups (portal switch, the join form,
  the member-form picker) delete the old row first in the same transaction.
  The portal's `resolveAvailableAction` only *explains* the limit ahead of
  time; it never enforces it.

## Events

- **Eligibility** — whether a member may view and answer an event, decided by
  visibility first: `public` needs nobody, `org` needs a member, `targeted`
  needs a member the event's **audience** reaches. The audience is the set of
  active members the `event_audience` rules resolve to (`group` → its active
  members, `category` → the active members of its groups, `member` → that
  member, `external` → nobody); it exists independently of visibility, so an
  `org` event can still carry an invite list. "Reaches" always implies
  "active member" — a suspended or pending person is never eligible, even when
  named. Nothing is stored: a member who joins a targeted group tomorrow is
  invited tomorrow.
  One pure resolver (`lib/events/eligibility.ts` `resolveEligibleMemberIds`)
  is the oracle. `server/queries/event-eligibility.ts` answers the two shapes
  of question differently: *one member, many events* (`isEligible`,
  `listEligibleEventIds`) is one SQL query over the member's own memberships,
  never an org-wide load; *many members* (`resolveAudiences`,
  `listEligibleMemberIds`) runs the resolver over an **audience snapshot** —
  the org's active memberships, group→category map, active member ids and
  category admins — loaded once per request. Forms resolve their own rules
  against the same snapshot.
