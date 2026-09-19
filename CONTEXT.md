# Domain glossary

Names for the concepts this codebase is built around. Architecture reviews
and refactors use these names; when a module is named after a concept, the
concept lives here.

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
