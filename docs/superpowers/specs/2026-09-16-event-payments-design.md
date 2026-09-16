# Event payments

**Date:** 2026-09-16
**Status:** approved design, not implemented

## Scope

Third of the three event-related projects (see
`2026-09-13-events-core-design.md`, `2026-09-14-forms-design.md`). An event may
carry a price; a confirmed "yes" creates a tracked payment with a variable
symbol, bank details and QR code, for members and guests alike; managers see
who has paid; the existing payment dashboards, emails and overdue handling
apply.

Deliberately out of v1 (tracked in Linear): ticket types (several named
prices per event with their own capacity), automatic release of unpaid seats,
online payment gateway, partial payments.

## Problem

Camps and trips cost money. Today a leader collects the fee by posting a bank
account in a chat and ticking names off in a spreadsheet, while the register
already knows who said yes, generates variable symbols and QR codes for
membership fees, and emails payment confirmations. `member_payments` has had
`type = 'event'` since the payments module shipped; nothing writes it.

## Decisions

- **Members and guests pay.** Anyone whose RSVP is `yes` and `confirmed` owes
  the fee: members, token holders, anonymous guests on the public page.
- **The payment is created by the RSVP.** A confirmed `yes` on a priced event
  creates a pending payment in the same transaction. Reserve-list seats are
  not charged until promoted. There is no separate "issue payments" step.
- **One price per person.** `price × (1 + guestCount)`. No ticket types, no
  guest rate.
- **Due date only, no consequence.** Unpaid payments turn `overdue` like
  membership fees; the seat is never released automatically.
- **Pending follows the RSVP, paid freezes.** A pending payment is cancelled
  or re-priced when the answer or guest count changes. A paid payment is never
  cancelled automatically; if its response stops being a confirmed yes it
  becomes `refund_due` and is pinned for the admin to settle by hand.
- **Guest identity lives on the response.** A guest payment points at its
  `event_responses` row and copies nothing; the retention shred already
  covers it.
- **Event managers handle their event's payments.** Whoever may manage the
  event may mark its payments paid, cancelled or refunded from the response
  list, without the `canManagePayments` capability. `/admin/payments` keeps
  its capability gate.
- **Membership fees and yearly reports behave exactly as today.** Every
  membership-fee read path gains an explicit `type = 'membership_fee'` filter;
  the existing test suites must pass unchanged.

## Data model

Migrations generated from `server/db/schema.ts`; all tenant rows carry
`orgId` and every query filters by it.

### `events` — new columns

| Column | Type | Notes |
| --- | --- | --- |
| `price_amount` | integer, null | minor units; null = free event |
| `price_currency` | text, null | defaults to the organization's fee currency in the form |
| `price_bank_account` | text, null | null = use `organizations.membership_fee_bank_account` |
| `payment_due_at` | timestamptz, null | null = derived, see below |

CHECKs: `price_amount IS NULL OR price_amount > 0`;
`(price_amount IS NULL) = (price_currency IS NULL)`.

Derived values, computed by `lib/events/payment-plan.ts`:

- effective bank account = `price_bank_account ?? organizations.membership_fee_bank_account`
- effective due date = `payment_due_at ?? rsvp_deadline_at ?? starts_at ?? (now + 14 days)`

An event with `price_amount` set and no effective bank account cannot be
published (`PAYMENT_BANK_ACCOUNT_MISSING`); the unpublished draft may be saved.

### `member_payments` — changes

| Change | Detail |
| --- | --- |
| `member_id` | becomes nullable |
| `event_id` | new, uuid null, FK `events` on delete cascade |
| `response_id` | new, uuid null, FK `event_responses` on delete **set null** — a paid record outlives a deleted response |
| `status` enum | gains `refund_due` |
| `cancellation_reason` | gains values `rsvp_withdrawn`, `refunded` (validated in the action, column stays text) |

Constraints and indexes:

- CHECK `member_payments_type_check`:
  `type = 'membership_fee'` ⇒ `member_id IS NOT NULL AND event_id IS NULL AND response_id IS NULL`;
  `type = 'event'` ⇒ `event_id IS NOT NULL`.
- Unique `(member_id, period_key)` becomes partial `WHERE type = 'membership_fee'`.
- New unique `(response_id) WHERE response_id IS NOT NULL AND status NOT IN ('cancelled')`
  — one live payment per response; a cancelled row may be followed by a new one.
- New index `(org_id, event_id)`.

Event rows store `period_key = 'event:<eventId>'` and `period_label = <event title at creation>`,
so `getPaymentTitle('event', periodLabel)` keeps rendering "Fee for <title>".
Variable symbols come from the existing `generateVariableSymbol(orgId)`.

Guest payments have `member_id = NULL`; name and email are read through
`response_id → event_responses.guest_name / guest_email`. After the retention
shred they render as "Guest".

## Membership-fee isolation

The consumer surface of `member_payments` is eight files. Each is touched only
to add a type filter or a nullable-member guard:

| File | Change |
| --- | --- |
| `server/lib/membership-report.ts` | `confirmedPaymentsFilter` and `syncReportMemberForPayment` add `type = 'membership_fee'`; an event payment never confirms membership nor creates a report row |
| `server/lib/payment-lifecycle.ts` | generation, renewal heads-up and existing-payment lookups add `type = 'membership_fee'`; the overdue flip keeps covering both types; the overdue email resolves guest recipients via the response join and skips shredded guests |
| `server/queries/payments.ts` | `listPaymentsForOrg` gains a `type` option and left-joins responses for guest names; stats gain a per-type breakdown; `getOverdueFeesByMember` adds `type = 'membership_fee'` |
| `server/actions/payments.ts` | `authorizePaymentIds`: a scoped group admin may only act on membership-fee rows of their members (event rows go through the event-manager path); full org admins act on everything |
| `server/lib/approval-payment-details.ts` | adds `type = 'membership_fee'` |
| `server/lib/member-data-export.ts` | unchanged for members (their event payments export with their other payments); guest payments export/erase with the response |
| `app/api/payments/qr/[token]/route.ts` | `innerJoin(tenantMembers)` becomes a left join; guest name from the response |
| `server/db/schema.ts` | as above |

Existing suites `membership-report`, `membership-report-freeze`,
`membership-report-comparison`, `membership-report-reminders`,
`membership-period`, `payment-qr-token` pass unchanged.

## Payment lifecycle

### `planEventPayment` — pure decision table

`lib/events/payment-plan.ts` exports
`planEventPayment({ event, response, current }) → PaymentPlan` where `current`
is the live payment row or null and the result is one of
`{ kind: 'create', amount }`, `{ kind: 'reprice', amount }`, `{ kind: 'cancel' }`,
`{ kind: 'refund_due' }`, `{ kind: 'noop' }`.

| Response state | No live row | Pending / overdue row | Paid row |
| --- | --- | --- | --- |
| yes + confirmed, event priced | create `price × (1 + guests)` | reprice if amount differs, else noop | noop |
| yes + reserve | noop | cancel | refund_due |
| no / maybe | noop | cancel | refund_due |
| response deleted | noop | cancel | refund_due |
| event unpriced or price removed | noop | cancel | noop |

"Live row" means status in `pending`, `overdue`, `paid`, `refund_due`.
A `refund_due` row is treated like paid: never re-priced, never cancelled
automatically. A cancelled row is not live; a later confirmed yes creates a
fresh row.

### `syncEventPayment` — the single write path

`server/lib/events/payments.ts` exports
`syncEventPayment(tx, { orgId, event, response })`. It loads the live row,
calls `planEventPayment`, applies the plan, and returns the plan so callers
can queue emails. Applying:

- `create`: insert `type = 'event'`, `status = 'pending'`, amount, currency,
  effective bank account, effective due date, VS, `period_key`, `period_label`,
  `member_id` (members) or null (guests), `event_id`, `response_id`.
- `reprice`: update `amount` only.
- `cancel`: `status = 'cancelled'`, `cancellation_reason = 'rsvp_withdrawn'`.
- `refund_due`: `status = 'refund_due'`.

Callers, all inside their existing transaction:

- `upsertResponse` in `server/lib/events/responses.ts` (member, token, guest
  RSVP paths) — after the response row is written.
- the standing action (`promote / demote`) in `server/actions/events.ts`.
- response deletion.
- event update when `price_amount`, `price_currency`, `price_bank_account`
  changes: iterate every response with `answer = 'yes'`; pending rows are
  re-priced, missing ones created, paid ones untouched. Bank account and
  currency changes apply to new rows only; existing pending rows keep what
  their QR already said.

If the sync throws, the surrounding transaction rolls back: a confirmed yes on
a priced event never exists without its payment.

### Manager actions

In `server/actions/events.ts`, each behind
`requireEventPaymentAccess(paymentId)` (new guard in
`server/queries/access.ts`: load the payment's `event_id`, dispatch to
`requireEventManagementAccess`):

- `markEventPaymentPaidAction({ paymentId, paidAt? })` — `pending | overdue → paid`,
  else `PAYMENT_NOT_PENDING`. Sends the existing paid email.
- `bulkMarkEventPaymentsPaidAction({ eventId, paymentIds })`.
- `cancelEventPaymentAction({ paymentId, reason })` — reasons: the existing
  set plus `rsvp_withdrawn`; `pending | overdue` only.
- `markEventPaymentRefundedAction({ paymentId })` — `refund_due → cancelled`
  with reason `refunded`, else `PAYMENT_NOT_PAID`.

These share the status-transition and email helpers with the existing
`markPaymentPaidAction` / `cancelPaymentAction` (extracted into
`server/lib/payment-status.ts`), so behaviour is identical whichever door is
used. The existing org-admin actions also accept event rows for full admins.

### Emails

Sent with `after()` outside the transaction; failures swallowed as elsewhere.

- `create` → new `emails/event-payment-email.tsx`: event title, amount,
  due date, `payment-details-section.tsx` (bank account, VS, QR via the existing
  signed `/api/payments/qr/[token]` route), link to `/portal/events/<slug>`
  (members) or `/events/rsvp/<token>` (guests). Recipient via
  `resolveMemberEmailForOrg` for members, `guest_email` for guests.
- `reprice` → same email, subject "updated".
- paid → existing `payment-confirmed-email.tsx`, extended to guest recipients.
- overdue → existing overdue email, extended to guest recipients.
- `refund_due`, `cancel` → no email.

Guest emails are gated by nothing but the presence of `guest_email`; member
emails respect the organization's existing `emailNotify*` switches.

## Access

| Action | Who |
| --- | --- |
| Set price on an event | whoever may manage the event |
| See payment state in the response list | whoever may manage the event |
| Mark paid / cancel / mark refunded from the event | whoever may manage the event |
| See and act on event payments in `/admin/payments` | `canManagePayments`, full org admins only (scoped group admins see only their members' membership fees, as today) |
| See own payment, QR, status | the responder (portal session, or RSVP token) |

Guest QR pages are reachable only through the RSVP token; the public
`/events/<slug>` page shows the price but never a payment.

## UI

### Admin — event sheet

A *Payment* section with a *Paid event* switch. When on: price (major units,
`feeToMinorUnits` at the boundary), currency (default org fee currency), bank
account (placeholder = org default), due date (placeholder = derived default).
Turning it off on an event with confirmed yeses asks for confirmation:
"Pending payments will be cancelled; paid ones are kept."

### Admin — event detail, response list

New *Payment* column: `—` (free / not charged), *Pending · 350 CZK · due 12 Oct*,
*Overdue*, *Paid 3 Oct*, *Refund due*. Filter by payment state. Row actions:
mark paid, cancel, mark refunded. Selection + bulk mark paid. Header stat
line: "12 of 18 paid · 4 200 CZK collected · 2 100 CZK outstanding".

### Portal — `/portal/events/[slug]` and public token page `/events/rsvp/[token]`

After a charged `yes`: a *Your payment* card (`components/app/payment-qr-card.tsx`)
with amount, QR, bank account, VS, due date and status; shown on every revisit
while a live payment exists. States: pending / overdue (QR), paid (check,
date), refund due ("we owe you a refund, the organiser will contact you").
Reserve-list yes shows "no payment needed until you are confirmed".

The public `/events/[slug]` page shows "350 CZK per person" beside capacity.

### Portal — `/portal/payments`

Event payments appear in the existing list labelled with the event title and
linked to the event; `refund_due` rows get a distinct badge and sort first.

### Admin — `/admin/payments`

Type filter chip (all / membership fees / events). A *Refunds due* section
above the table listing `refund_due` rows with a *Mark refunded* action.
Guest rows show the guest name (or "Guest") and the event title.

### i18n

All new strings in `lib/i18n/messages.ts`, English and Czech.

## Error handling

New `EventError` codes:

| Code | When |
| --- | --- |
| `PAYMENT_BANK_ACCOUNT_MISSING` | publishing or pricing an event with no effective bank account |
| `PAYMENT_NOT_PENDING` | mark paid / cancel on a row that is not `pending` or `overdue` |
| `PAYMENT_NOT_PAID` | mark refunded on a row that is not `refund_due` |

Email failures never surface. Rate limits on guest RSVP are unchanged; a
payment is created at most once per live response, so the unique index also
bounds abuse.

## Testing

Vitest in `tests/`:

- `events-payments.test.ts` — every cell of the `planEventPayment` table;
  amount with guests; effective bank account and due-date derivation; `refund_due`
  treated as paid.
- `membership-report.test.ts`, `membership-report-freeze.test.ts` — added
  case: an event payment whose `period_label` equals the reporting period
  neither confirms membership nor creates a report member.
- `payment-qr-token.test.ts` — guest payment QR uses the guest name; shredded
  guest renders without a name.
- `events-rsvp.test.ts` — added case: the RSVP transaction rolls back when
  payment creation fails.

All existing suites pass unchanged.

Manual checklist in `docs/event-payments-user-test.md`: member yes → email →
QR in portal; guest yes on the public page → token page QR → email; change
guest count → repriced; flip to no after paying → `refund_due` on top of
`/admin/payments`; leader without `canManagePayments` marks paid from the
response list; membership-fee generation and the yearly report unaffected.

## Follow-ups (Linear)

- Ticket types: several named prices per event, each with optional capacity,
  chosen at RSVP time.
- Automatic release of unpaid seats after the due date, promoting the reserve.
- Online payment gateway (Stripe / GoPay) with automatic matching.
- Partial payments and instalments.
