# Handoff — Yearly member report, fixes and gaps

You are continuing a feature that is **already built and committed**. Read this whole file
before writing any code. It lists confirmed defects, unreachable code, and gaps, in the order
I would fix them.

- Commits: `1ca2d1c` (backend), `7472dba` (group card), `fbca2fe` (board, reminders, seeds).
- Migrations `0037`–`0041`. `0038` is a hand-written data migration; the rest are generated.
- There is no production database. The local dev DB can be wiped and reseeded; do not write
  data migrations for legacy rows.
- Fixtures: `pnpm db:seed:report --email=you@example.com`, reversible with `--reset`. It
  creates five regions spanning every report status. `pnpm db:seed:payments` is separate and
  seeds payment scenarios.

## What the feature is

Each year the organization reports its paid members to a board, broken down by region. Regions
confirm and lock their own roster; the board reviews and approves each one. Regions are the
active groups in the single group category flagged `manages_membership_fees`.

Two surfaces, and the same person may legitimately use both:

- **`/admin/groups/[categoryId]/[groupId]` → "Yearly report" tab** — a region's own roster.
  Guarded by `requireGroupManagementAccess`.
- **`/admin/reports`** — the board. Guarded by `canManageOrganization` **and**
  `organizations.membership_report_enabled`.

## The five invariants — do not break these

1. **A submitted or approved roster is frozen.** Members confirmed after submission are written
   with `pending_addition = true` and held out of every count until a group admin accepts them,
   which sends the group back to `returned`. Two write paths enforce this today —
   `syncReportMemberForPayment` and the backfill inside `openMembershipReport`. **A third write
   path must not be added without going through the same check**; the freeze bypass in the
   backfill was a real bug found late (see `frozenReportGroupIds`).
2. **The report snapshots; it never joins live.** Names, group names, period bounds and fee
   amounts are copied onto report rows. `group_memberships` has no validity period, so a live
   join would silently rewrite history whenever someone changes region. Every member/user/
   payment FK on the report tables is `ON DELETE SET NULL` for the same reason — except
   `group_id`, which is wrong (see item 1 below).
3. **Cached counts are only ever written by `recalculateReportGroupCounts`.** They are
   denormalized so the board table does not fan out one aggregate per row. Writing report
   member rows with raw SQL and not recalculating produced a visibly wrong dashboard once
   already. The seeder is careful about this; keep it that way.
4. **Period bounds are calendar dates in UTC.** `new Date(2026, 0, 1)` is midnight *local*,
   which in Europe/Prague persisted to a `date` column as `2025-12-31`. Everything goes through
   `Date.UTC` and every formatter passes `timeZone: PERIOD_DATE_TIMEZONE`. See
   `lib/membership-period.ts`.
5. **Authorization routes through the group, never the report row.** `requireReportGroupAccess`
   looks up the row's `group_id` and then calls the ordinary `requireGroupManagementAccess`. A
   report row is not addressable on its own. This is why the dual-role case (org admin who also
   runs a region) needed no special handling.

## Where things live

| Concern | File |
|---|---|
| Tables, enums, org settings | `server/db/schema.ts` |
| Period resolution, UTC rules | `lib/membership-period.ts` |
| Status labels, sort order, `daysUntil` | `lib/membership-report-status.ts` |
| Open/backfill/sync/recalculate | `server/lib/membership-report.ts` |
| Reminder ladder and digest | `server/lib/membership-report-reminders.ts` |
| Read models for both surfaces | `server/queries/membership-reports.ts` |
| All mutations | `server/actions/membership-reports.ts` |
| Reminder recipients | `server/notifications/recipients.ts` |
| Board UI | `components/app/membership-report-board.tsx` |
| Region UI | `components/app/group-report-card.tsx` |
| Templates | `emails/membership-report-{reminder,digest}-email.tsx` |

Payment hooks live in `server/actions/payments.ts` — `markPaymentPaidAction`,
`bulkMarkPaymentsPaidAction` and `cancelPaymentAction` all call `syncReportMemberForPayment`
**awaited, not deferred**, so the report entry is written in step with the payment decision.

---

# Tier 1 — the numbers are wrong

## 1. Deleting a group destroys its report history

`membership_report_groups.group_id` is `ON DELETE CASCADE` (verified: `confdeltype = 'c'`).
Deleting a region deletes every historical report row for it and, by cascade,
`membership_report_members` beneath. This directly contradicts invariant 2 — `group_name` is
copied onto the row *precisely* so a deleted group still reads correctly, and then the FK
deletes the row anyway.

**Fix**: change to `ON DELETE SET NULL` and make `group_id` nullable, or `RESTRICT` if you
would rather forbid deleting a group that has reported. `SET NULL` is more honest: an
organization must be able to retire a region without erasing the years it existed. If you take
`SET NULL`, audit every query that joins on `group_id` — `getGroupReportView`,
`getBoardReportView` (which joins `groups` only for `sort_order`) and the reminders' `rows`
query all assume it resolves.

## 2. Confirmed members in no region are invisible

Anyone who paid but is not in a group under the fee-managing category appears in **no** report.
In the current dev DB that is 3 of 32 confirmed members. The board's total is silently wrong
and nothing surfaces it.

```sql
-- the shape of the problem
with confirmed as (
  select p.member_id from member_payments p
  where p.period_label = $1
    and (p.status = 'paid' or (p.status = 'cancelled' and p.cancellation_reason = 'waived'))
)
select count(*) filter (where not exists (
  select 1 from group_memberships gm join groups g on g.id = gm.group_id
  where gm.member_id = c.member_id and g.category_id = $2
)) from confirmed c;
```

**Fix**: `openMembershipReport` and `syncReportMemberForPayment` already compute
`getReportGroupIdByMember` and silently `return`/`flatMap`-drop when there is no match. Count
those instead and surface them. Minimum viable: an "unassigned" figure in the board stats with
a dialog listing the names, so somebody can put them in a region. Consider blocking
report *closure* while it is non-zero.

## 3. Mixed currencies collapse silently

`recalculateReportGroupCounts` (`server/lib/membership-report.ts:115`) uses
`min(membership_report_members.currency)`. Groups may override `fee_currency`, so a region
billing EUR alongside CZK yields a total that sums two currencies under one label.
`getOverdueFeesByMember` in `server/queries/payments.ts` has the same pattern.

**Fix**: either constrain the report to a single currency per organization and validate it at
open time, or store per-currency subtotals. The first is almost certainly right for this
product — say so explicitly rather than leaving `min()` to decide.

---

# Tier 2 — built but unreachable

## 4. A report can never be closed from the UI

`closeMembershipReportAction` is wired to nothing. The whole `closed` state — read-only
rendering, the "Closed" badge, the year picker's handling of it, the server-side guards added
to approve and send-back — is reachable only by SQL.

**Fix**: a "Close the year" control on `/admin/reports`, with confirmation naming what it
means (no further edits; rosters become permanent). Natural home is beside the period picker.
Consider refusing to close while any group is not `approved`, or requiring an explicit
acknowledgement of how many are unapproved.

## 5. `setReportDeadlineAction` is dead code too

Per-report deadline override exists server-side; no UI reaches it. Either wire it (an editable
deadline on the board header) or delete it. Related: `openMembershipReport` re-derives
`confirm_due_at` from organization settings on every "Refresh from payments", so a per-report
override would be silently overwritten. Fix that at the same time — a refresh should not touch
a deadline somebody set deliberately.

## 6. `confirmation_basis = 'manual'` has no way to be used

The enum value, the mandatory-note rule, and the board's display all exist. There is no button.
Someone who paid cash outside the system cannot be added, so regions will work around it by
marking a fake payment paid — exactly the corruption the design exists to prevent.

**Fix**: "Add a member" on the region's report card, restricted to members of that group who
are not already on the roster, with a mandatory reason. It must respect the freeze (invariant
1) — a manual add to a submitted roster is a pending addition like any other.

## 7. A group created mid-year does not appear until someone refreshes

`openMembershipReport` doubles as "Refresh from payments" and is the only thing that inserts
`membership_report_groups` rows. Nothing prompts an admin to run it.

**Fix**: either create the row on group creation when an open report exists (a hook in
`server/actions/groups.ts`), or have the board detect and surface the drift — "2 groups are not
in this report".

---

# Tier 3 — process and UX

## 8. A submitted group with pending additions is never reminded

`remindOrganization` skips `submitted` and `approved`. But a submitted group with a late payer
is precisely the group with work waiting. The freeze creates a task and tells nobody.

**Fix**: include submitted groups with `pending_additions > 0` in the reminder pass, with
different wording. The ladder columns are per group row, so this needs care — the stage was
already consumed before submission. Consider a separate `pending_addition_reminded_at` rather
than overloading `reminder_stage_sent`.

## 9. No export

The organization does this in Google Sheets today and at some point has to hand the numbers
over. There is no CSV or PDF out. Without it, this is a better Sheet that data cannot leave.

**Fix**: CSV per region and for the whole report, from the board view. Columns should match
what the board actually submits — ask the user before designing them. Note the GDPR line: the
region-scoped export must contain only that region's members.

## 10. No bulk approve

Twelve regions is twelve clicks and twelve refreshes. Add a multi-select on the board table.
The self-approval guard must apply per row, not to the batch — a bulk approve that silently
skips the caller's own submission is worse than one that reports it.

## 11. No audit trail

Only the latest state is stored. "Who removed this member, and when" is unanswerable, and a
returned-then-resubmitted report overwrites its own history. For a record the board signs off,
that is thin. Consider an append-only `membership_report_events` table written by the same
actions that mutate state.

## 12. Reminder emails are hardcoded English

Both templates set `lang="en"` and all copy is inline English. Only the dates respect
`organizations.locale`. Note that `lib/i18n/messages.ts` is currently a stub holding little
more than `appName`, so the whole app shares this gap — do not treat it as report-specific, and
do not invent a translation layer here alone without agreeing the approach.

## 13. "Refresh from payments" silently reopens a closed year

`openMembershipReport`'s upsert sets `status: "open"`, `closedAt: null` unconditionally. If the
current period has been closed, refreshing reopens it with no warning. Reopening should be a
deliberate, named action.

---

# Tier 4 — infrastructure

## 14. There is no test runner in this repo

No `vitest`, no `test` script, no test directory. This module is roughly 1,500 lines of date
arithmetic, state machines and freeze rules, and it was verified entirely by throwaway scripts
that were deleted after use. Nothing will catch a regression.

If you add one thing beyond the fixes above, make it this. The highest-value targets, in order:

1. `getDueStage` in `membership-report-reminders.ts` — 15 date cases, pure, no DB. The ladder
   must not repeat a rung, must catch up a skipped one, and must repeat `overdue` every 7 days.
2. `resolveMembershipPeriod` and `resolveConfirmDueDate` — the UTC boundary bugs are exactly
   the kind that reappear.
3. `getConfirmationBasis` — the paid/waived/nothing rule.
4. The freeze: a member confirmed against a `submitted` group must land as a pending addition
   through **both** write paths.

---

# Improvements, not defects

- **Portal view.** Members cannot see their own confirmation status. "You are confirmed for
  2026" closes the loop and reduces questions to region admins.
- **Year-over-year comparison.** The seeder's own return reason reads *"two names are missing
  compared with last year"* — the data to answer that sits in `membership_report_members` and
  nothing surfaces it. A diff against the previous year on the region card would be the single
  most useful addition to the review step.
- **Per-region deadlines**, for organizations that stagger.
- **"Why isn't X in the report?"** — a diagnostic that explains, for one member, which of the
  conditions in item 2 they fail.

# Known-good behaviour — verify you have not broken it

- Backfill on open: paid and waived both count, waived contributes 0 to the money.
- Late payment on a submitted roster: recorded, `pending_addition = true`, counts unchanged.
- Accepting a pending addition returns the group to `returned` and clears the approval.
- Send-back clears the reminder ladder so the group is chased again.
- Reminder ladder: 14 / 7 / 1 then weekly overdue, no repeats, skipped rungs caught up.
- Digest rides the group reminders' cadence; when nothing is outstanding it paces itself off
  `membership_reports.digest_sent_at`.
- Self-approval is refused unless `membership_report_allow_self_approval` is on, and the
  exception is recorded permanently on the row.
- A closed year renders read-only on both surfaces, with controls withdrawn rather than
  disabled; the year picker keeps `?report=<id>` in the URL so a year is linkable.
