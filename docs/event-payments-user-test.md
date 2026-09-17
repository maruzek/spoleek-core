# Event payments — live user test before production

**Feature:** Event payments (spec `docs/superpowers/specs/2026-09-16-event-payments-design.md`,
branch `event-payments`).
**Date written:** 2026-09-16.
**Goal:** prove, with real people in real roles, that a priced event charges exactly the people
who owe, that every door into a payment (RSVP, standing change, price edit, manager action)
lands on the same record, that guests are reached without an account, and that membership fees
and the yearly report are untouched. Automated tests cover the decision table and the
membership-fee isolation (`tests/events-payments.test.ts`, `tests/membership-report-*.test.ts`,
`tests/payment-qr-token.test.ts`); this document covers what only a person in front of the app
can check.

Mark each item ✅ / ❌ / ⚠️ and note the account used. Anything ❌ in sections 5–6 blocks release.

---

## 0. Set-up

**People needed (four browsers / profiles):**

| Role | Account | Why |
| --- | --- | --- |
| Org admin | `org_admin` member with `canManagePayments` | Dashboard, refunds, fee generation |
| Event manager | group admin **without** `canManagePayments`, managing one group | Marks paid from the response list |
| Plain member | active member with a linked user, invited to the group event | Portal RSVP, portal payment card |
| Outsider | no account; an incognito window + a real mailbox you can read | Guest RSVP, token page, guest email |

**Data needed:**

- Organization fee settings: `membershipFeeBankAccount` set (the fallback account), currency CZK.
- A published **public** event with a price, `maxGuestsPerResponse ≥ 1` and a future RSVP deadline.
- A published **targeted** event owned by the event manager's group, priced, capacity 2.
- Resend configured so payment emails actually arrive.
- Optional fast path: `pnpm db:seed:events` adds *Weekend trip to Šumava* (public, 350 CZK, one
  payment in each state, including a guest); `--reset` removes the demo events.

**How it is implemented (what to expect):**

- A confirmed **yes** on a priced event creates the payment in the same transaction as the RSVP
  (`syncEventPayment`). Reserve-list yeses are not charged until promoted.
- Pending payments follow the answer: guest-count change re-prices, no / maybe / demotion /
  deletion cancels with reason `rsvp_withdrawn`. Paid ones freeze and become **refund due**
  instead; nothing moves them on but a manager.
- Guest payments have no member row; name and email are read through the RSVP. After the
  retention shred they render as "Guest" and get no more emails.
- Emails: *Payment for <event>* on create, *Updated payment for <event>* on re-price,
  the existing *Payment confirmed* on mark paid, the overdue email from the nightly cron.
  Nothing is sent for cancel or refund-due.

---

## 1. Admin — pricing an event (org admin, then event manager)

### 1.1 Wizard
- [ ] New event → **Payment** step: switch off by default; review shows *Price: Free*.
- [ ] Switch on: currency prefilled with the org currency; bank account placeholder shows the org
      account; *Pay by* description says which fallback applies (deadline / start / 14 days).
- [ ] Price `0`, `-5`, `12.345` → field error; `350.50` accepted; review shows "350.5 CZK per person".
- [ ] Draft saved with a price and **no** bank account anywhere (clear the org account first) →
      save works; **Publish** fails with the bank-account message; add an account → publish works.
- [ ] Edit a published priced event that has confirmed yeses, switch **Paid event** off → confirm
      dialog "Pending payments will be cancelled; paid ones are kept." Cancel keeps the price;
      confirm makes it free and pending rows show *Cancelled* on the response list, paid ones stay.
- [ ] Change the price on a priced event with pending payments → they re-price; a paid one does not;
      the re-priced members receive *Updated payment for …*.

### 1.2 Response list (event manager without `canManagePayments`)
- [ ] **Payment** column visible; free event shows no column.
- [ ] Filter by payment state works alongside the answer filter; "Not charged" lists reserve / no / maybe.
- [ ] Row actions: *Mark paid* (date + note) → badge *Paid* with date; member gets *Payment confirmed*.
- [ ] *Cancel* with reason *RSVP withdrawn* → *Cancelled*; a second yes from that person creates a fresh pending row.
- [ ] Selection checkboxes appear only on pending / overdue rows; bulk *Mark N as paid* updates them all.
- [ ] Header line "X of Y paid · collected · outstanding" and the **Paid** stat tile match the rows.
- [ ] *Confirm place* on a reserve row on a priced event → a pending payment appears at once.
- [ ] *Remove* a response with a paid payment → the payment row survives as **Refund due**
      (check `/admin/payments` as org admin).

## 2. Member — portal

- [ ] Open the targeted event; the aside shows *Price · 350.00 CZK per person* (+ "Guests pay the same" when guests allowed).
- [ ] Answer **yes** → *Your payment* card appears without reload: amount, QR, bank account, VS, due date, *Pending*.
- [ ] Email *Payment for <event>* arrives with the same VS and a working QR image; button opens the portal event page.
- [ ] Change guests from 0 to 1 → card shows the doubled amount; *Updated payment* email arrives.
- [ ] Answer **no** → card disappears; `/portal/payments` shows the row as *Cancelled* in history.
- [ ] Fill the event (capacity 2) with two others, answer yes → reserve list; card says "No payment needed yet".
- [ ] After the manager marks the payment paid: card shows a green check and the date; `/portal/payments` lists it under history, linked to the event.
- [ ] Manager cancels the confirmed place after payment → `/portal/payments` shows **Refunds due to you** first with the card in the refund state.

## 3. Outsider — public page and token link

- [ ] `/events/<slug>` shows the price beside the places; answering **yes** with 1 guest shows the
      thank-you with "Payment details are on the page behind your link, and in the email".
- [ ] The token page (`/events/rsvp/<token>`) shows the *Your payment* card with `2 × price`.
- [ ] The guest email arrives at the mailbox; the QR image loads without signing in; the link opens the token page.
- [ ] Change the answer on the token page to **no** → card gone; back to yes → new VS (a fresh row).
- [ ] Manager marks the guest paid → *Payment confirmed* arrives at the guest mailbox.
- [ ] Run `/api/internal/shred-event-guests` after the event date has passed → the row reads "Guest" on `/admin/payments`; the QR endpoint still renders (no name in the message); no further emails.

## 4. Org admin — `/admin/payments`

- [ ] Type chips *All / Membership fees / Events* filter the table; guest rows show "guest" next to the name.
- [ ] Event rows link to the event; the detail dialog shows an **Event** row and, for refund due, the explanatory line and *Mark refunded*.
- [ ] **Refunds due** card lists every `refund_due` row with amount and paid date; *Mark refunded* closes it as *Cancelled · Refunded* and it leaves the card.
- [ ] A scoped group admin with `canManagePayments` sees only their members' membership fees — no event rows, no guest rows, and cannot act on an event payment id pasted into the dialog.
- [ ] Financial health cards include event money in totals; debt aging lists an overdue guest by guest name.

## 5. Membership fees and the yearly report — unchanged

- [ ] *Generate payments* creates membership fees exactly as before; a member who already has an event payment titled like the period still gets a fee.
- [ ] Marking an event payment paid creates **no** row on the open yearly report; refreshing the report from payments ignores event rows.
- [ ] The member detail *Payments* tab lists both types; "overdue fees" badges on the members list count membership fees only.
- [ ] Portal home strip "you owe" includes both an unpaid fee and an unpaid event payment.

## 6. Safety

- [ ] Remove the org bank account, keep an event priced with no own account, answer yes as a member → error toast with the bank-account message and **no** response row is written (answer still unanswered).
- [ ] Two browsers race for the last seat on a priced event → exactly one payment; the reserve one is not charged.
- [ ] The QR endpoint with an edited token → 404; with the guest's real token after the event → still 200 until 90 days past due.
