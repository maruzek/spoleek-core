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
