# Event payments — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-16-event-payments-design.md`
**Date:** 2026-09-16

Six phases, each ending in a green `pnpm typecheck && pnpm lint && pnpm test`
and a commit. Phases 1–3 have no UI. Every phase names the existing code it
copies from — read that file before writing the new one. The invariant that
governs every phase: **membership fees and yearly reports behave exactly as
today**; whenever a membership-fee read path is touched, the only change is an
added `type = 'membership_fee'` filter, and the existing test suites pass
unchanged.

Steps marked **[you]** embody a product decision with more than one valid
answer; the scaffold (file, signature, tests) is prepared first and the body is
left for you to write.

---

## Phase 1 — Schema and migration

**Files:** `server/db/schema.ts`, `server/db/migrations/*` (generated).

1. `memberPaymentStatusEnum`: append `refund_due`. Doc-comment: set when a
   paid event payment loses its confirmed-yes response; only a manager moves it
   on (`cancelled` / `refunded`).
2. `events`: add `priceAmount`, `priceCurrency`, `priceBankAccount`,
   `paymentDueAt` after `maxGuestsPerResponse`, with the two CHECKs from the
   spec (`events_price_amount_check`, `events_price_currency_check`). Extend
   the table doc-comment with one sentence: price is per person, null means
   free, bank account and due date fall back to the organization / RSVP
   deadline.
3. `memberPayments`:
   - `memberId` → drop `.notNull()`.
   - add `eventId` (FK `events`, cascade) and `responseId` (FK
     `eventResponses`, **set null**) after `memberId`.
   - replace `member_payments_member_period_key_idx` with the same unique
     `.where(sql\`type = 'membership_fee'\`)`.
   - add `member_payments_response_live_idx`: unique on `responseId`
     `.where(sql\`response_id IS NOT NULL AND status <> 'cancelled'\`)`.
   - add `member_payments_org_event_idx` on `(orgId, eventId)`.
   - add CHECK `member_payments_type_check` per spec.
   - Doc-comment above the table (there is none today; write one in the
     `events` style): membership-fee rows are keyed by member and period,
     event rows by response; guest rows have no member and read their
     identity through the response.
4. Row types: `MemberPayment` already exists; nothing new. Add
   `EVENT_PAYMENT_PERIOD_KEY_PREFIX = "event:"` next to the enum exports.
5. `pnpm db:generate`; read the SQL. Confirm: the enum `ALTER TYPE ... ADD VALUE`
   is in its own statement (Postgres cannot use a new enum value in the same
   transaction it was added — Drizzle splits it, verify), the old unique index
   is dropped before the partial one is created, and `member_id` is
   `DROP NOT NULL`. `pnpm db:migrate` locally.

**Done when:** migration applies on a fresh and a seeded DB; typecheck green;
`pnpm test` green (nothing else changed yet).

---

## Phase 2 — Pure modules and tests

**Files:** `lib/events/payment-plan.ts`, `lib/events/schemas.ts`,
`tests/events-payments.test.ts`.
**Pattern:** `lib/events/rsvp.ts` + `tests/events-rsvp.test.ts`.

1. `lib/events/payment-plan.ts`:
   - Types: `PricedEvent = Pick<Event, "priceAmount" | "priceCurrency" |
     "priceBankAccount" | "paymentDueAt" | "rsvpDeadlineAt" | "startsAt" |
     "title">`, `PlanResponse = Pick<EventResponse, "answer" | "standing" |
     "guestCount"> | null` (null = deleted), `LivePayment = Pick<MemberPayment,
     "status" | "amount"> | null`.
   - `export type PaymentPlan = { kind: "create"; amount: number } | { kind: "reprice"; amount: number } | { kind: "cancel" } | { kind: "refund_due" } | { kind: "noop" }`.
   - `isLivePayment(status)`: `pending | overdue | paid | refund_due`.
   - `eventPaymentAmount(event, response)`: `priceAmount * (1 + guestCount)`.
   - `planEventPayment({ event, response, current }): PaymentPlan` **[you]**
     — the decision table in the spec is the default reading; the scaffold
     has the signature, the tests below pin every cell. One question the
     spec leaves to you: when a `paid` response's guest count *grows*, the
     spec says noop (paid rows are frozen). Decide whether to keep that or
     return a new plan kind (`{ kind: "top_up", amount }`) that creates a
     second pending row for the difference — if you add it, add the cells
     to the tests and the apply step in Phase 3.
   - `resolveEventPaymentDetails({ event, orgBankAccount, now })` →
     `{ bankAccount: string | null; dueAt: Date }` with the two fallbacks.
   - `EVENT_PAYMENT_DEFAULT_DUE_DAYS = 14`.
2. `lib/events/schemas.ts`: extend `eventFormSchema` (or whichever the wizard
   uses — check `components/app/events/event-wizard/types.ts`) with
   `paid: boolean`, `priceAmount` (major units, positive, max 2 decimals),
   `priceCurrency` (3 letters), `priceBankAccount` (optional, trimmed),
   `paymentDueAt` (optional ISO). `superRefine`: `paid` ⇒ amount and currency
   present. Conversion to minor units happens in the action, not the schema
   (same as membership fees: `feeToMinorUnits` at the boundary).
   Add `markEventPaymentPaidSchema`, `bulkMarkEventPaymentsPaidSchema`,
   `cancelEventPaymentSchema` (reason enum = existing four + `rsvp_withdrawn`),
   `markEventPaymentRefundedSchema`.
3. `tests/events-payments.test.ts`: a `describe` per row of the spec table,
   an `it` per cell (15 cells + the "refund_due treated as paid" cases);
   amount with 0 / 2 guests; `resolveEventPaymentDetails` fallback chain
   (event account → org account → null; due → deadline → start → now+14d).

**Done when:** all new tests green; nothing under `server/` touched yet.

---

## Phase 3 — Server: sync, status helpers, isolation, guards, actions, emails

### 3a. Status helpers (`server/lib/payment-status.ts`) — extraction

Move the bodies of `markPaymentPaidAction` / `cancelPaymentAction` /
`bulkMarkPaymentsPaidAction` in `server/actions/payments.ts` into
`markPaymentsPaid(tx | db, { orgId, paymentIds, userId, paidAt, adminNote })`,
`cancelPayments(..., { reason, note })`, `markPaymentRefunded(..., { paymentId, userId })`
(`refund_due → cancelled`, `cancellationReason = "refunded"`), and
`sendPaymentConfirmedEmail` (already a function; move it). The org-admin
actions become thin: resolve scope → call helper → `after(email)`. Behaviour
must be unchanged: keep `syncReportMemberForPayment` awaited in the same
place. `sendPaymentConfirmedEmail` gains the guest branch: left-join
`tenantMembers`, left-join `eventResponses`; recipient is the member's
resolved email or `guestEmail`; name from either. Skip when neither exists
(shredded guest).

### 3b. Membership-fee isolation

Add `eq(memberPayments.type, "membership_fee")` to:

- `server/lib/membership-report.ts` — `confirmedPaymentsFilter`, and the
  lookup inside `syncReportMemberForPayment` (return early when the payment's
  `type !== "membership_fee"`).
- `server/lib/payment-lifecycle.ts` — every select that keys on
  `periodLabel` / `periodKey` (generation existence check, renewal heads-up
  `membersWithPayment`, `getPendingPaymentsForMember` if used there). The
  overdue flip at line ~457 keeps both types. `sendOverdueEmails` gains the
  guest branch as in 3a.
- `server/queries/payments.ts` — `getOverdueFeesByMember`,
  `getPendingPaymentsForMember` (portal top strip: keep both types — it is
  "what do I owe"; decide and comment), `listPaymentsForOrg` gains
  `options.type` and left-joins `eventResponses` + `events` for
  `guestName`, `eventTitle`, `eventSlug` on `PaymentRow`. `getPaymentStats`
  groups by `(status, type)`.
- `server/lib/approval-payment-details.ts` — filter.
- `server/actions/payments.ts` `authorizePaymentIds` — for scoped admins,
  additionally drop rows where `memberId` is null or `type = 'event'`.
- `app/api/payments/qr/[token]/route.ts` — left joins; name from member or
  response; `buildSpdString(payment, name ?? undefined)`.
- `server/lib/member-data-export.ts` — read it; member export already
  selects by `memberId`, so event rows of that member are included naturally.
  Confirm and add nothing.

Tests added here (DB-free, following how the existing report tests build
fixtures): `membership-report.test.ts` — an `event` row with the reporting
`periodLabel` is ignored by the confirmation filter; `payment-qr-token.test.ts`
— guest name path. Run the whole suite; the pre-existing tests must not change.

### 3c. Sync (`server/lib/events/payments.ts`)

```ts
export async function syncEventPayment(tx, { orgId, event, response, responseId, now }): Promise<PaymentPlan>
export async function syncEventPaymentsForEvent(tx, { orgId, event }): Promise<{ created: number; repriced: number; cancelled: number }>
```

`syncEventPayment`: select the live row for `responseId` (`status <> 'cancelled'`,
`FOR UPDATE`), call `planEventPayment`, apply. `create` needs the org's
`membershipFeeBankAccount` (pass it in; callers already load the org) and
`generateVariableSymbol(orgId)` from `payment-lifecycle.ts` (export it if it
isn't). `periodKey = EVENT_PAYMENT_PERIOD_KEY_PREFIX + event.id`,
`periodLabel = event.title`. If the effective bank account is null, throw
`EventError("PAYMENT_BANK_ACCOUNT_MISSING")` — this can only happen if the
org account was removed after publish, and rolling back the RSVP is the safe
answer.

`syncEventPaymentsForEvent`: all responses with `answer = 'yes'`, sync each.

Wire it:

- `server/lib/events/responses.ts` `upsertResponse` — after the upsert,
  when `event.priceAmount != null` *or* a live payment exists (so a price
  removal still cancels), call sync. Return the plan alongside the response.
- `setResponseStandingAction`, `removeResponseAction` (response = null) in
  `server/actions/events.ts`.
- `updateEventAction`: when any price column changed, `syncEventPaymentsForEvent`
  in the same transaction. `publishEventAction`: `PAYMENT_BANK_ACCOUNT_MISSING`
  when priced and no effective account (draft save is allowed).
- `EventError` codes: add the three from the spec and their messages in
  `lib/i18n/messages.ts`.

### 3d. Guard and manager actions

- `server/queries/access.ts`: `requireEventPaymentAccess(paymentId)` — select
  `eventId` (`type = 'event'`, `orgId` of the current org), `notFound()` if
  missing, then `return requireEventManagementAccess(eventId)` extended with
  `{ payment }`.
- `server/actions/events.ts`: `markEventPaymentPaidAction`,
  `bulkMarkEventPaymentsPaidAction` (guard on the event, intersect ids with
  the event's payments), `cancelEventPaymentAction`,
  `markEventPaymentRefundedAction` — each calls the 3a helper and queues the
  same emails.
- `server/actions/payments.ts` `markPaymentRefundedAction` for the admin
  dashboard (org scope via `authorizePaymentIds`).

### 3e. Emails

- `emails/event-payment-email.tsx` — copy `payment-renewal-headsup-email.tsx`
  structure; props `{ organizationName, recipientName, eventTitle, amount,
  currency, dueAt, paymentDetails (bank, VS, qrUrl), link, updated: boolean }`.
  Register in `server/actions/email-preview.ts` like the others.
- `server/lib/events/payment-emails.ts`: `sendEventPaymentEmail(paymentId, { updated })`
  resolving recipient exactly as 3a. Called via `after()` from every
  action whose sync returned `create` / `reprice` (the three RSVP actions,
  standing action, `updateEventAction` for each created/repriced id — collect
  ids from the sync).
- Add `event_payment` to `emailKindEnum` if email activity logging keys on
  it (check `emailActivities` usage in `server/lib/email.ts`).

### 3f. Queries for the UI

`server/queries/events.ts`: `listEventResponses` gains a left join on the
live payment (`id, status, amount, currency, dueAt, paidAt`);
`getEventCounts` gains `paidCount, chargedCount, collectedMinor, outstandingMinor`.
`getMemberResponse` and the token-page loader gain the same live payment.
`server/queries/payments.ts`: `listRefundsDue(orgId)`.

**Done when:** an RSVP on a seeded priced event creates a row visible in
`/admin/payments` (no new UI yet — verify in Adminer); full suite green.

---

## Phase 4 — Admin UI

**Files:** `components/app/events/event-wizard/step-schedule.tsx` (or a new
`step-payment.tsx` + `types.ts`), `event-responses-panel.tsx`,
`event-admin-stats.tsx`, `components/app/payments/*`, `payments-admin.tsx`,
`app/admin/payments/page.tsx`.

1. Wizard/sheet: *Paid event* switch → price, currency, bank account
   (placeholder = org account, loaded with the other org data the wizard
   already has), due date (placeholder = derived). Review step shows the
   price line. Turning off on an event with confirmed yeses: `AlertDialog`
   with the spec wording.
2. Response list: *Payment* column using `payment-status-badge.tsx`
   (add `refund_due` variant), filter select, row actions via
   `payment-actions.tsx` extended with the event actions, selection + bulk
   mark paid (the panel already has selection for copy-emails — reuse).
3. `event-admin-stats.tsx`: paid/charged and collected/outstanding.
4. `payments-admin.tsx`: type chip filter; *Refunds due* card above the
   table (`listRefundsDue`) with *Mark refunded*; guest rows show
   `guestName ?? "Guest"` and the event title linking to the event.
   `payment-detail-dialog.tsx`: event section.
5. i18n for every string, en + cs.

**Done when:** the manual checklist's admin rows pass in the browser.

---

## Phase 5 — Portal, public and token pages

**Files:** `components/app/events/portal-event-rsvp.tsx`,
`token-event-rsvp.tsx`, `guest-rsvp-form.tsx`, `public-event-card.tsx`,
`components/app/payment-qr-card.tsx`, `app/portal/payments/payments-table.tsx`,
`app/events/rsvp/[token]/page.tsx`, `app/portal/events/[slug]/page.tsx`.

1. `PaymentQrCard`: accept the states pending / overdue / paid / refund_due
   and an optional event title; keep the existing membership-fee usage
   compiling.
2. Portal event page and token page: render the card under the RSVP control
   when a live payment exists; reserve-list copy; after a fresh `yes` the
   RSVP actions return the payment so the card appears without a reload.
3. `guest-rsvp-form.tsx` / public page: price line beside capacity; after
   answering, the existing "we sent you a link" copy mentions the payment
   details are on that page and in the email.
4. `/portal/payments`: event rows labelled with the event title, linked;
   `refund_due` badge and sort-first.
5. i18n.

**Done when:** the manual checklist's member and guest rows pass.

---

## Phase 6 — Seed, docs, hand-off

1. `scripts/seed-events-test.ts`: one priced event with a mix of pending,
   paid, overdue and refund_due responses, including a guest; add
   `db:seed:events` note to CLAUDE.md commands if not present.
2. `docs/event-payments-user-test.md` — the manual checklist from the spec,
   in the style of `docs/forms-user-test.md`.
3. PRD §5.7: one paragraph pointing at the spec, like §5.5 / §5.6.
4. `docs/gdpr-review.md`: note that guest payments carry no PII of their own
   and are covered by the response shred.
5. Linear follow-ups: ticket types, auto-release, gateway, partial payments.

---

## Order and dependencies

1 → 2 → 3a → 3b → 3c → 3d → 3e → 3f → 4 → 5 → 6. Phases 4 and 5 are
independent of each other once 3 is done. 3b can be done and committed
before 3c as its own "isolation" commit — do that, so the diff that proves
"membership fees unchanged" is reviewable on its own.
