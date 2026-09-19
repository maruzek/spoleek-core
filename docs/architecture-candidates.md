# Architecture candidates — deepening backlog

**Written:** 2026-09-19, from an architecture review of branch `design-sync`.
**Vocabulary:** module, interface, implementation, depth (deep = small interface
hiding a large implementation; shallow = interface as wide as the implementation),
seam (where a dependency can be swapped), adapter (concrete implementation behind
a seam), leverage (one interface serving many call sites), locality (bugs
concentrate where the logic lives). Domain terms come from `CONTEXT.md`; add a
term there when you name a module after a concept that is not in it yet.

**Template to measure against:** `server/lib/events/responses.ts` `upsertResponse`
— one interface hides row lock, capacity, standing and payment sync; 10 call
sites. The recurring weakness elsewhere is the inverse: the *decision* is pure
and tested, but the *gate around it* (RBAC, scope, eligibility loading) is
re-expressed at every call site, and those call sites have no tests.

**Test surface today:** 142 safe actions in `server/actions/*`, none reached by
tests, because every guard bottoms out in `headers()` (`server/queries/auth.ts`)
and is called *inside* the action body. DB-touching tests use the
`canReachDb ? describe : describe.skip` harness (see
`tests/group-membership-status.test.ts`, `tests/payment-scope-db.test.ts`).

Each candidate below has a **Done when** list. Run `pnpm typecheck`,
`pnpm lint` (7 errors in `components/ui/*` are pre-existing) and `pnpm test`
before calling one finished. Do not touch the "well built" list at the end.

---

## ✅ 2 · Payment scope — DONE (2026-09-19)

`lib/payments/scope.ts` (`PaymentScope`, `paymentInScope`, `canActOnPayment`),
`getPaymentScope` / `resolvePaymentScopeForRows` in `server/queries/access.ts`,
`listPaymentsForOrg({ scope })`. The four `*EventPayment*Action` twins in
`server/actions/events.ts` were deleted; the manager door survives as a widening
of the scope. Use it as the worked example for the pattern: **the guard takes the
resolved viewer as a parameter instead of calling `headers()`**, which is what
made `getPaymentScope` testable with a fake access object.

---

## ✅ 1 · Viewer — DONE (2026-09-19)

`lib/access/viewer.ts` (`Viewer`, pure predicates: `canManageGroup`,
`canManageCategory`, `canOverseeCategory`, `canManageOwner`, `getCapabilities`,
`getAdminAccessLevel`), `server/queries/viewer.ts` (`loadViewer` memoised with
React `cache()`, `requireViewer`, `getViewer`, `loadViewerScope`). Every guard
in `server/queries/access.ts` takes a `Viewer` first; `authActionClient` puts
one on `ctx.viewer` (`sessionActionClient` is session-only, for setup). The
`can*`/`require*` twins are gone — one predicate per rule. Payment mutations
live in `server/lib/payment-actions.ts` and are tested through a hand-built
Viewer (`tests/helpers/viewer.ts`, `tests/access-predicates.test.ts`,
`tests/payment-scope-db.test.ts`). Left as is: `requireOrganization()` still
has 18 action call sites (now cached, so harmless); replace with
`ctx.viewer.organization` when touching those files.

---

## 3 · Deepen Event eligibility — **Strong**

**Files**
- `lib/events/eligibility.ts` :56-137 `resolveEligibleMemberIds` (pure, tested
  in `tests/events-eligibility.test.ts`)
- `server/queries/events.ts` :46-83 `loadEligibilityInputs`, :85
  `listEligibleMemberIds`, :93-101 `isMemberEligibleForEvent`, :113-123
  `listEligibleMembers`, :462-522 `listEventsForViewer` (loop :475-482),
  :301-388 `getEventRecipients`
- `app/admin/events/[id]/page.tsx` :33-53
- consumers of `listEventsForViewer`: `server/queries/portal-group-detail.ts`,
  `server/queries/portal-dashboard.ts`

**Problem.** The pure function's interface takes *all* active group
memberships, *all* groups and *all* active members of the org. That is easy to
unit-test and impossible to call cheaply: `loadEligibilityInputs` is 4 queries
including the whole `group_memberships` table, run once **per targeted event**
in the portal agenda and 1 + 6 times on the admin event page (once per
`eventRecipientFilterSchema` option inside `getEventRecipients`).
`isMemberEligibleForEvent` answers a one-member question by materialising the
whole set. None of the callers are tested.

**Deepening.** One eligibility module that owns a per-request org snapshot and
answers the two real questions: `isEligible(viewer, event)` and
`eligibleSets(viewer, events[])`. The pure function stays as the oracle the DB
path is tested against.

**Deletion test.** `isMemberEligibleForEvent` (3 callers) and
`listEligibleMembers` (1 caller) inline to one line each → shallow, delete.

**Done when**
- Portal agenda issues one snapshot load regardless of event count (assert the
  query count in a DB test, or at least assert one `loadEligibilityInputs`
  call via a spy).
- `getEventRecipients` loads the snapshot once for all filter options.
- A DB test compares the new path against `resolveEligibleMemberIds` on a
  seeded org.

---

## ✅ 4 · Group Category selection invariant — DONE (2026-09-19)

`lib/groups/selection-limit.ts` (`resolveSelectionViolation`, pure, tested in
`tests/group-selection-limit.test.ts`) is enforced inside
`upsertActiveMembership` (`server/lib/group-membership.ts`), which now opens
its own transaction (a savepoint when handed one) and throws
`GroupMembershipError` with a human message. `validateManagedGroupSelection`
is deleted; `validateGroupSelectionOrThrow` shrank to the RBAC half
(`requireGroupIdsInScopeOrThrow`) plus a catch that turns the seam's error
back into a `groupIds` field error. `syncManageableGroupMemberships` moved
next to the upsert so the member-form door is testable. Bulk assign skips
refused members and returns them; adopt-drift gained a
`category_selection_full` skip reason. `tests/group-selection-invariant.test.ts`
drives all five doors. **Selection limit** added to `CONTEXT.md`.
Concurrent writes are serialised by a `FOR UPDATE` lock on the member row.

---

## 5 · Make the email door the only door — **Worth exploring**

**Files**
- `server/notifications/send.ts` :13 `sendNotificationEmails` — documented as
  "the single door every admin notification goes through"; records
  `email_activities`
- bypassers calling `resend.emails.send` directly: `server/lib/payment-lifecycle.ts`
  (×2), `server/lib/payment-status.ts` :236-251,
  `server/lib/events/payment-emails.ts`, `server/lib/workspace/provision.ts`,
  `server/actions/member-admin.ts` :1427, `lib/auth/auth.ts` (×2)
- `getResendClient` imported in 11 files; 7 hardcoded English subjects outside
  `lib/i18n`

**Problem.** `server/queries/email-health.ts` and the per-member "Emails" tab
are blind to payment-confirmed, welcome and provisioning mails. Subjects for
those bypass i18n. The seam exists; the adapters go around it.

**Deepening.** One `send(kind, recipients, react, subjectKey)` that always logs;
`getResendClient` exported only to it and the webhook route. Two adapters
justify the seam: Resend in prod, in-memory in tests (replaces the single
`vi.mock` in `tests/member-workspace-purge.test.ts`).

**Done when**
- `grep -rl getResendClient server lib` returns the send module and the
  webhook route only.
- Every subject comes from `lib/i18n/messages.ts`.
- A test asserts a payment-confirmed email through the in-memory adapter and
  finds its `email_activities` row.

---

## 6 · One Responder view for the three RSVP surfaces — **Worth exploring**

**Files**
- `app/portal/events/[slug]/page.tsx` :20-50,
  `app/events/rsvp/[token]/page.tsx` :36-114, `app/events/[slug]/page.tsx` :22-34
- `components/app/events/portal-event-rsvp.tsx` (117 lines) vs
  `token-event-rsvp.tsx` (114 lines) — 23 lines differ after renaming
- `server/actions/events.ts` — three respond actions (member / token / guest)
  that already converge on `upsertResponse`

**Problem.** detail → counts → own response → live payment → forms → after-RSVP
dialog → props is rebuilt per surface with drifts (the token page filters
`submittedAt == null`, the public page does not; the portal page checks
`item.open.open`, the token page does not). "RSVP state" spans ~12 files.
These are the churn leaders of the last 80 commits.

**Deepening.** One server-side responder-view builder keyed by responder
identity (`member | token | guest`) returning one shape; one `EventRsvp` client
parameterised by which respond action to call.

**Done when**
- One view builder, one client component; the two twins deleted.
- The builder has a test per responder kind on a seeded priced event.
- Add **Responder** to `CONTEXT.md`.

---

## 7 · "Approve member" as a lifecycle transition — **Worth exploring**

**Files**
- `server/actions/member-admin.ts` :355-570 `approveMemberAction` (file is 1549
  lines, 0 tests)
- `server/lib/member-lifecycle.ts` (tested: delete, restore — not approve)
- collaborators: `server/lib/payment-lifecycle.ts` :384,
  `server/lib/workspace/provision.ts`, `server/lib/member-invites.ts`,
  `server/lib/member-age.ts`

**Problem.** One action body decides `pending → active | invited` from three org
settings × three acknowledgement flags, writes the member row twice, generates
a payment, provisions Google, logs an auth event and sends an invite —
sequentially, outside a transaction, ordering documented only in comments
("must run before provisioning"). Reachable only via `headers()`.

**Deepening.** `approveMember(viewer, member, flags)` in
`server/lib/member-lifecycle.ts`, one tx, returns the transition; the action
becomes guard → call → revalidate.

**Done when**
- `approveMemberAction` is ≤ 30 lines.
- A DB test drives the transition through each settings/flags combination
  with the erasure tests' harness.

---

## 8 · Split the dictionary by feature — **Speculative**

**Files** `lib/i18n/messages.ts` (1794 lines; `en` :17-905, `cs` :915-1750;
20 of the last 80 commits, all net-additive).

**Problem.** Co-change hub, not a bug magnet (`cs: Dictionary` catches drift).
Costs are merge conflicts and locality: a feature's strings sit in two regions
900 lines apart. The header (:4-9) still claims the dictionary covers
signed-out pages only. Admin UI is hardcoded English, so the dictionary is not
the leverage point for the surface that changes most.

**Deepening.** `lib/i18n/<feature>.ts` exporting `{ en, cs }`, assembled into
the same typed `Dictionary`. Interface (`useDictionary()`, `getDictionary()`)
unchanged. Decide and document whether admin will ever be translated.

**Done when** each feature namespace lives in its own file with en/cs
side by side; `typeof en` still types `cs`.

---

## 9 · Merge the portal Group view into one module — **Speculative**

**Files** `server/queries/portal-groups.ts` (240),
`server/queries/portal-group-detail.ts` (443),
`server/lib/portal-group-summaries.ts`, `lib/groups/portal-group-page.ts`;
consumer `components/app/portal/portal-group-page.tsx` (866 lines, takes the
whole ~35-field `PortalGroupDetail`).

**Problem.** The pieces are fine; the split costs when reading. The page
component's prop is the entire read model — interface as wide as the
implementation.

**Deletion test.** Deleting `portal-group-summaries.ts` would duplicate
`loadLeadersByGroup` into both query files → concentrates, keep — which is the
signal the two query files want to be one module with `list` and `detail`
entry points.

**Done when** one module, two entry points; summaries and bucketing internal;
page prop narrowed to what it renders. Lowest urgency: just synced, well tested.

---

## Cross-cutting leaks (fix opportunistically while in the area)

- `"empty array ⇒ no filter"` idiom in Drizzle `where` clauses: 7× in
  `server/queries/*.ts`. Candidate 2 shows the fix (tagged value, `sql\`false\``).
- `server-only` is not installed: 50 client components `import type` from
  `@/server/queries`, 52 from `@/server/db/schema`. Nothing catches the first
  non-type import. Install it and add `import "server-only"` to `server/db`.
- `"group_admin"` literal in 24 files; `tenantMembers.status = "active"`
  spelled 20 times (7 with `isNull(deletedAt)`). There is `activeMembership()`
  for group rows and no equivalent for member rows.
- RBAC outside `access.ts`: `server/lib/member-management-scope.ts`,
  `server/actions/member-admin.ts` :151 `assertMemberInScopeOrThrow`.

## Well built — do not touch

`server/lib/events/responses.ts` `upsertResponse`; `lib/events/payment-plan.ts`
+ `server/lib/events/payments.ts` `syncEventPayment`;
`lib/groups/portal-actions.ts`; `server/actions/group-membership-requests.ts`
(lock → pure decision → write → notify-in-`after`);
`server/lib/membership-report.ts` with its freeze/comparison tests;
`lib/payments/scope.ts` (candidate 2).
