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

## 1 · Collapse the access-guard twins into one Viewer — **Strong**

**Files**
- `server/queries/access.ts` — `getViewerAppContext` :151, `requireAdminAccess`
  :636, `requireGroupManagementAccess` :484 vs `canManageGroup` :523,
  `requireEventOwnerAccess` :722 vs `canManageEvent` :778,
  `requireEventManagementAccess` :821
- `lib/safe-action-auth.ts` :11-30 (`authActionClient`, `orgAdminActionClient`)
- `server/queries/auth.ts` :6-9
- every `server/actions/*` file: 82 in-body guard calls; 98 of 142 actions
  ignore `ctx`

**Problem.** "Who may manage group G / event E" is written twice — a throwing
`require*` and a non-throwing `can*` — with structurally different bodies
(`requireEventOwnerAccess` goes through the `canManageGroups` capability gate;
`canManageEvent` does not). Every guarded call re-resolves the viewer from
scratch: `requireEventManagementAccess` → `requireOrganization` →
`requireEventOwnerAccess` → `requireGroupManagementAccess` →
`requireGroupAdminModuleAccess` → `requireAdminAccess` → `getViewerAppContext`
→ `requireOrganization` again → `getCurrentMember` … ≈15–18 queries before the
action does its own work. `requireOrganization()` has 26 uncached call sites;
`grep -c 'cache(' server/queries/access.ts` = 0. The `orgAdminMiddleware`
queries `systemRole`, then `requireOrgAdminAccess` queries it again (:673-678).

**Deepening.** One `Viewer` value per request — session, org, member,
systemRole, scoped category ids, scoped group ids — resolved once in the
safe-action middleware (into `ctx.viewer`) and once per page. Each `require*`
becomes "throw unless `can*`(viewer, …)" so there is exactly one predicate per
rule. Actions read `ctx.viewer` and stop calling `headers()`-bound guards.
`getPaymentScope(access)` already has this shape; generalise it.

**Deletion test.** Deleting the `can*` twins forces the `require*` guards to
expose their predicate for the portal pages → concentrates. Collapse.

**Suggested order**
1. Introduce `Viewer` (type + one loader) and make `getViewerAppContext` build
   it; memoise with React `cache()` for the request.
2. Rewrite `canManageGroup` / `canManageEvent` to take a `Viewer`; make the
   `require*` twins one-liners over them.
3. Add `ctx.viewer` to `authActionClient`; migrate actions file by file
   (start with `server/actions/payments.ts`, then `events.ts`, `groups.ts`).
4. Tests: `tests/access-predicates.test.ts` constructing Viewers by hand;
   one DB test per predicate for the scoped-admin cases.

**Done when**
- `grep -c "await require" server/actions/*.ts` drops to ~0 for the migrated
  files; guards take a `Viewer`.
- `canManageGroup` / `canManageEvent` are the only place each rule is spelled.
- At least one action in `server/actions/payments.ts` has a test that never
  touches `headers()`.
- Add **Viewer** to `CONTEXT.md`.

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

## 4 · Group Category selection invariant behind the write seam — **Worth exploring**

**Files**
- `lib/groups/portal-actions.ts` :105-126 (single mode + `maxSelections`, tested)
- `server/lib/member-management-scope.ts` :215-240
  `validateManagedGroupSelection` (single mode only, untested)
- `server/actions/member-admin.ts` :113-150 `validateGroupSelectionOrThrow`
- `server/actions/groups.ts` :433-470 `assignGroupMemberAction`, :472
  `assignGroupMembersAction` — **no check**
- `server/lib/group-registration.ts` :109 and
  `server/lib/workspace/adopt-drift.ts` — straight to the upsert
- `server/lib/group-membership.ts` :33 `upsertActiveMembership` (7 callers) —
  the natural home

**Problem.** "One active group per single-select category / ≤ N per
multi-select" is a data invariant enforced fully at one door, half at another,
not at all at three. It will surface as "admin put a member in two regions".

**Deepening.** Enforce the invariant inside `upsertActiveMembership` (it
already takes a tx: lock the member's rows in the category, count, reject).
Keep `resolveAvailableAction` in `lib/groups/portal-actions.ts` only for the
portal's *pre-explanation* of why an action is unavailable. Delete
`validateManagedGroupSelection` and `validateGroupSelectionOrThrow`.

**Done when**
- One DB test inserts through each of the 5 doors and asserts the second
  single-select membership is rejected everywhere.
- The two validators are gone; the portal decision table test still passes.

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
