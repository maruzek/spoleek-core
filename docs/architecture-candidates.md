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

## ✅ 3 · Event eligibility — DONE (2026-09-19)

`server/queries/event-eligibility.ts` splits the question by shape. *One
member, many events* — `isEligible`, `listEligibleEventIds` — is one SQL query
(`event_audience` rows whose group / category / member reaches the member via
`IN (SELECT …)` over their own active memberships, gated by an `EXISTS` on
the active member row); the portal agenda and `getEventDetail` no longer load
anything org-wide. *Many members* — `resolveAudiences`, `listEligibleMemberIds`
— runs the pure resolver over `loadAudienceSnapshot` (React `cache()`, so a
request loads it once). `getEventRecipients` returns every filter's list from
one resolution; the admin page and the send action pick from it.
`isMemberEligibleForEvent`, `listEligibleMembers` and `loadEligibilityInputs`
are deleted; `server/queries/forms.ts` resolves form audiences against the
same snapshot. `tests/event-eligibility-db.test.ts` pins the SQL path to the
pure resolver on a seeded org and asserts the portal agenda's query count is
constant in the number of events. **Eligibility** / **audience snapshot**
added to `CONTEXT.md`. Left as is: the module is keyed on `memberId`, not a
`Viewer` as sketched — the token and guest RSVP surfaces have no Viewer, so
`memberId` is the honest common denominator until candidate 6 introduces a
**Responder**; fold `isEligible` behind it then.

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

## ✅ 5 · Make the email door the only door — DONE (2026-09-19)

`server/notifications/send.ts` is now the only module that imports the
Resend SDK: `getResendClient` is not exported at all. It holds the seam
(`Mailer` — `send`, `fetchCopy`, `inspectAccount`; `resendMailer` and
`createMemoryMailer`, swapped with `installMailer`), the door (`sendEmail`:
one message, one `email_activities` row, never throws, returns `sent` +
`activityId`) and `sendNotificationEmails` as the batch form over it. The
seven bypassers are gone: payment confirmed / overdue / renewal / event
payment, both workspace welcomes, the activation invite and the password
reset all go through the door, under five new `email_kind`s (`event_payment`,
`payment_confirmed`, `payment_overdue`, `payment_renewal_headsup`,
`password_reset`; migration `0067`). `recordMemberInviteEmailSent/Failed`
were folded into one `recordEmailActivity` that takes `inviteId` /
`resendOfActivityId` / `actorUserId`, so the invite path is the door plus
three fields. The preview action and the health page read through the
adapter; the webhook route calls `verifyResendWebhook`. Every subject is a
dictionary entry (nine added, en + cs, including the report reminder /
digest subjects that had inline English plurals) and the five templates'
preview lines read the same entry; `paymentOverdueEmailSubject` /
`eventPaymentEmailSubject` are deleted. `tests/email-door-db.test.ts` drives
a payment-confirmed mail through the memory adapter to its row, the org
switch, a refused send (failed row + `failed` event, no throw) and an
idempotent retry; `tests/member-approval-db.test.ts` installs the memory
mailer instead of mocking the module. **Mailer** added to `CONTEXT.md`.
Found on the way: `email_activities.provider_email_id` is unique, and a
Resend idempotent retry returns the first id — the door now returns the
existing row for it instead of failing the insert. The password reset is
logged under the account's live member row (`resolveMembershipForUser`),
falling back to the app organization for a system admin. Left as is:
`scripts/send-payment-emails-test.ts` sends through the adapter, not the
door, on purpose — review mail must not appear in an org's activity log.

---

## ✅ 6 · One Responder view for the three RSVP surfaces — DONE (2026-09-19)

`lib/events/responder.ts` (`Responder` = `member | token | guest`; pure:
`responseOwnerOf` → the row key `upsertResponse` writes under,
`submissionIdentityOf`, `selectAfterRsvpForm`, `tokenLinkState`; the client
slice `RsvpView`) and `server/queries/responder.ts` (`memberResponder`,
`resolveTokenResponder` — holder + validity + display name + owning account
in one call, null for a dead link — `getResponderResponse`,
`getResponderView`). The three pages are door → `getResponderView` → render;
the token form page and both token actions (`respondWithToken`,
`submitFormWithToken`) resolve the holder through the same door, so the
external holder's `guestName` is now the audience rule's name everywhere,
not the email on one path. `portal-event-rsvp.tsx` and `token-event-rsvp.tsx`
are deleted for one `EventRsvp` parameterised by `target`; `GuestRsvpForm`
takes the same `RsvpView`. Drifts resolved by construction: one after-RSVP
rule (open ∧ not submitted — `open` was already implied by the list),
counts always loaded, `externalNameFor` gone. `upsertResponse`'s parameter
type was renamed `ResponseOwner` (two lines) so **Responder** means one
thing. `tests/responder-view-db.test.ts` drives every door on a seeded
priced event with a required, yes-gated `after_rsvp` form, plus the token
door's dead / closed / reissued cases. **Responder** added to `CONTEXT.md`.
Left as is: `respondToEventAction` still calls `isEligible(orgId, memberId)`
directly — it keeps the `NOT_ELIGIBLE` message distinct from `NOT_FOUND`,
which `getEventDetail` folds together; `isEligible` stays keyed on
`memberId` since a member Responder carries nothing more.

---

## ✅ 7 · "Approve member" as a lifecycle transition — DONE (2026-09-19)

`lib/members/approval.ts` (`resolveApprovalRoute`, pure: settings × flags ×
age signal → `workspace | invite | direct` or a refusal; also home of
`isWorkspaceModuleReady` / `usesEmailPasswordActivation`) and `approveMember`
in `server/lib/member-lifecycle.ts`, which takes the Viewer and the member row
and returns the transition. Refusals happen before any write; the payment row
and the Google account sit outside the transaction (neither rolls back) in a
documented order; role, status and the `member_approved` event commit together
under a `FOR UPDATE` re-check of `pending`; the invite runs after the commit.
`approveMemberAction` is 20 lines: scope → `assertMemberInScopeOrThrow` →
`approveMember`. `tests/member-approval-route.test.ts` pins the matrix;
`tests/member-approval-db.test.ts` drives every route, the failed-provisioning
retry (one payment row, not two) and each refusal on its own org with the
erasure tests' harness, faking only the network edges (directory, Resend,
Better Auth). **Approval route** added to `CONTEXT.md`. Found on the way:
`sendMemberActivationInvite` located the member via `getAppOrganization()`
(the oldest org), not the caller's — it now takes `orgId`; the other three
`getMemberByIdForInvite` callers (webhook / activation paths, no viewer) still
fall back. `logMemberAuthEvent` accepts a `tx`. Two client toasts read
`result.invite?.sent` / `.reason` instead of the flat `inviteSent` fields.

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
