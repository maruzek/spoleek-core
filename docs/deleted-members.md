# Deleted members

How a membership is deleted, what an administrator can see and undo while it is
deleted, what happens to the member's Google Workspace account, and when the
record is finally erased.

Status: **implemented**. Migrations 0058, 0059, 0060.

Related: MAR-55 (delete Workspace account on member delete), MAR-159 (make the
Workspace disposition configurable — deferred, see §9), MAR-153 (eligibility
window / aging out), MAR-50 and `docs/gdpr-review.md` §B1, §H2.

---

## 1 · The shape of a deletion

A deletion has three moments, and conflating them is what the previous
implementation got wrong.

| Moment | What happens |
|---|---|
| **Delete** | `status` → `deleted`, the retention anchor is stamped, sessions are revoked, the member is emailed. The row and the Workspace account both survive. |
| **Grace window** | 30 days by default. The record is visible to administrators, restorable by them, and the member's Workspace account keeps working so they can export their own data. |
| **Purge** | The Workspace account is deleted, then the member row, then any orphaned login. Nothing is recoverable from Spoleek afterwards. |

Rejecting a *pending application* is not this. `rejectMemberAction` still calls
`hardDeleteMembers` and erases the record immediately, with no window — the
rejection email promises the applicant their details are gone, and that promise
is kept literally.

---

## 2 · What was wrong before

`softDeleteMembers` tagged the member and revoked their sessions;
`purgeDeletedMembers` erased them 30 days later. In between, the member was
**invisible to every human being in the application**:

- every read in `server/queries/members.ts` filtered `ne(status, "deleted")`;
- the admin table's row type was literally
  `Exclude<TenantMember["status"], "deleted">`;
- `MEMBER_STATUS_DISPLAY_ORDER` omitted `deleted`, so a leaked row would have
  sorted as unranked;
- **there was no restore action anywhere in the codebase.**

The 30-day window bought a recovery period nobody could use. It was a backup,
not an undo.

Separately, the member's Google Workspace account was never touched. The row
carried `workspaceUserId` / `workspaceUserEmail` / `workspaceProvisionedAt` and
`server/lib/workspace/client.ts` had no delete-user call at all, so a deleted
member's account outlived the record that pointed at it — with a live refresh
token and nothing left able to find it.

---

## 3 · Decisions

**Visibility.** Deleted members stay in the members table; there is no separate
screen. Org admins *and* scoped (group) admins see them and both may restore. A
scoped admin sees a deleted member exactly when they would have seen them alive:
`canAccessMemberInScope` reads `group_memberships`, and soft delete leaves those
rows alone, so the member stays inside the same admin's scope for the whole
window.

**Workspace account.** One fixed behaviour, deliberately the permissive one: the
Google account **keeps working through the entire grace window**, and the member
is emailed the date after which it goes. At purge time it is deleted along with
the record.

A departing member's Drive, Gmail and Photos are theirs to take with them, and
suspending on the day of deletion removes the only means they have of taking
them. Their Spoleek sessions are already revoked and `getCurrentMember` refuses
a `deleted` member, so a live Google account grants no access to the
organization's Spoleek data. Making this configurable is MAR-159.

**Aging out.** Nothing automatic. MAR-153's review queue is the whole answer: an
aged-out member is surfaced for a human to decide. Ending someone's membership
and their email account on the strength of a custom-field date nobody has
verified is not a decision to automate.

---

## 4 · Schema

Migration **0058** adds to `tenant_members`:

| Column | Why |
|---|---|
| `previous_status` | Restore has to put the member back where they were. Without it the only defensible guess is `active`, which silently un-archives a member off the billing roster or un-suspends one somebody suspended on purpose. |
| `purge_after` | The retention anchor as stored data, not `deleted_at` plus a constant recomputed at read time. Shortening the constant must not retroactively erase people whose grace period was already promised in writing, and one member can be held longer without a global config change. This is also MAR-142's anchor. |
| `deletion_reason` | New enum `member_deletion_reason`: `admin_request`, `member_request`, `aged_out`, `system`. An Art. 17 erasure request and an admin tidying the roster are different events. |
| `workspace_purge_attempts` | The purge makes a network call per member; a failure has to be counted, not retried blindly. |
| `workspace_purge_last_error` | So a permanently failing account is visible rather than silently retried forever. |

Plus a partial index `tenant_members_purge_idx` on `purge_after`
`where status = 'deleted'` — the purge job's only query.

No new value on `membership_status`. `deleted` plus these columns says
everything the UI needs, and a new enum value forces every `switch` in the app
to grow a branch.

Migration **0059** is hand-written: it backfills
`purge_after = deleted_at + 30 days` and `deletion_reason = 'admin_request'` for
rows deleted before 0058. Without it those rows would sit in the grace window
forever, since the purge reads the column. `previous_status` is left null for
them — it is not recoverable.

Migration **0060** adds `membership_deleted` to `email_kind`.

---

## 5 · Reads

`listTenantMembers` and `getMemberById` take `includeDeleted` (default
`false`). The filter moved from unconditional to defaulted, so every other
caller stays safe without changing.

The five sibling lookups — `getMemberByUserId`, `getTenantMemberByUserId`,
`findShadowMemberForUser`, `findTenantMemberByEmail`, `getMembersByIds` — keep
their unconditional filter and gain no such option. They answer "who is this
person, right now" for the auth, registration and linking paths, and a deleted
member must never be that answer.

`MEMBER_STATUS_DISPLAY_ORDER` gains `deleted`, last, so deleted rows sink below
archived.

---

## 6 · The status filter

### 6.1 · Behaviour

A multi-select in the members-table toolbar listing every `membership_status`
with its colour dot. Every status except `deleted` is selected by default.
Ticking `deleted` is how an admin reaches deleted members; unticking the rest is
how they see only those. One control, no separate mode.

### 6.2 · Why it is not the ReUI block

`pnpm dlx shadcn@latest add @reui/c-select-23` does **not** install the
multi-select in this project. ReUI serves a different block per style:

| Style | `c-select-23` resolves to |
|---|---|
| `base-nova` | "Multi-select with overlapping dots" |
| `radix-nova` (this project) | "Select with colored status dots" — single-select |

The multi-select version is built on Base UI's `Select` (`multiple`, an `items`
prop, a render-prop `Value`). `components/ui/select.tsx` here is Radix and
supports none of those, and 27 files import it — letting the CLI install its
`select` dependency would have rewritten every select in the app to buy one
filter.

`@base-ui/react` was already a dependency (it is what `combobox.tsx` is built
on) and its `Select` supports `multiple`, so `components/ui/multi-select.tsx` is
a new wrapper under a new name, styled part-for-part against `select.tsx`.
`select.tsx` is untouched.

### 6.3 · The client/server seam

The important thing the control hides: **deleted rows are not in the payload at
all.** `listTenantMembers` never returned them, so no client-side filter could
surface one. The filter therefore spans both layers:

- the selection is mirrored into `?status=active,pending,…`, omitted when it
  equals the default so ordinary links stay clean, and `none` for a deliberate
  empty selection;
- `app/admin/members/page.tsx` reads it and passes
  `includeDeleted = selected.includes("deleted")` to `getMembersAdminPageData`;
- the client applies the full selection as a TanStack column filter on `status`.

Ticking `deleted` costs a server round-trip; every other combination is instant.
The URL carrying the state also makes "the deleted members list" bookmarkable.

An unparseable or wholly unknown `?status=` degrades to the default rather than
to an empty table — a stale bookmark should show the roster, not "no members
found".

### 6.4 · Colours

`lib/member-status-display.ts` is the single source of truth. The table renders
a status as a `Status` badge and the filter renders it as a dot; those were
going to be two independent mappings (a `variant` in one, hard-coded Tailwind
classes in the other), which is exactly how a status ends up amber in the table
and grey in the dropdown. `dotClassName` is derived from the same variant.

---

## 7 · Rows, restore, and the purge

### 7.1 · In the table

Deleted rows show the `Deleted` badge with a "purges in N days" hint beneath —
days rather than a date, because the question being asked is "have I still got
time to undo this". Row selection is disabled for them
(`enableRowSelection` on `DataTable`), so bulk actions cannot be aimed at
something already deleted, and the only row actions are **Restore** and
**Open**.

### 7.2 · Restore

`restoreMemberAction` → `restoreMembers`. Scoped exactly like deletion. It sets
`status` back to `previous_status` and clears `deletedAt`, `deletedByUserId`,
`deletion_reason`, `purge_after` and the workspace-purge counters.

Sessions are not resurrected — the member signs in again, which also rebuilds
their access from their current role rather than a stale token.

**The one collision restore can hit is email.** `tenant_members_org_user_idx` is
unique *and covers deleted rows*, so a linked user cannot have gained a second
membership during the window. Email is only a plain index, and
`findTenantMemberByEmail` skips deleted rows, so the same person may have
re-registered mid-window. Restore detects that, refuses, and reports the address
in `conflictedEmails` — two live records for one human is worse than a refused
restore, and only an administrator can decide which record is the real one.

Rows with no `previous_status` (deleted before 0058) restore to `suspended`: the
one status that is visible, harmless, and obviously awaiting a human decision.

### 7.3 · Purge

`purgeDeletedMembers` is **no longer a single transaction**. It makes a Google
API call per member with a Workspace account, and holding a transaction open
across a network round trip would lock `tenant_members` for as long as Google
takes to answer.

1. select `status = 'deleted'` and `purge_after <= now()` and
   `workspace_purge_attempts < MAX_WORKSPACE_PURGE_ATTEMPTS`;
2. for each with a `workspaceUserId`, call `deleteWorkspaceUser`. A 404 counts
   as success;
3. delete the cleared rows in one transaction, then `deleteOrphanedIdentities`.

**The ordering is the point.** The member row is the only record that a
Workspace account still needs deleting. Erase the row first and one timeout
strands a live mailbox with a working refresh token that nothing in the system
can ever find again. Keeping the row is the recoverable error.

A row with no `purge_after` is skipped, never erased on a guess.

Two failure modes, both settled deliberately:

- **Repeated failure.** `MAX_WORKSPACE_PURGE_ATTEMPTS = 5`. Past it the member
  drops out of the query, is reported in `stalledMemberIds`, and the cron route
  logs it at error level separately from the info line. The row stays. Retrying
  forever is invisible; erasing the row to unstick the job strands the account.
  Worth saying plainly: **this holds a member record past its retention
  period**, which is why it must be loud rather than routine.
- **Workspace disconnected.** `WorkspaceNotConnectedError` means the account can
  never be deleted from Spoleek however long the row is kept. Erasure proceeds
  and the address is logged for whoever administers the directory. Retaining
  personal data past its retention period to preserve a pointer that no longer
  works is the worse of the two failures.

`deleteWorkspaceUser` (`server/lib/workspace/client.ts`) is
`DELETE /admin/directory/v1/users/{userKey}`, following the existing
`WorkspaceApiError` conventions. It reports a 404 as `alreadyGone` rather than
throwing: the account may have been removed in the Admin console, or by a run
that crashed after Google had already acted, and in both cases the caller's
desired state already exists.

---

## 8 · The member's email

`emails/membership-deleted-email.tsx` + `notifyMembershipDeleted`
(`server/notifications/membership.ts`), sent from `deleteMemberAction` and
`bulkDeleteMembersAction` via `after()` so the admin does not wait on Resend and
a mail failure cannot undo a deletion that already happened. English and Czech
copy in `lib/i18n/messages.ts` under `emails.membershipDeleted`.

It says: the membership has ended; the record is erased on `purge_after`; and —
only for a member who has one — that their Workspace account still works until
that date, that Google Takeout is how to export it, and that everything left in
it after that date is gone.

**It is sent to the personal address, never only to the Workspace one.** The
whole point of the message is that the Workspace address is about to be deleted;
delivering the warning there and nowhere else would work right up until it
mattered. A member with no personal address on file gets nothing and a warning
is logged — a gap worth knowing about rather than papering over with the address
being withdrawn.

`softDeleteMembers` returns `deletedMemberIds`, not just a count, so a bulk
delete that skipped protected admins does not email people whose membership is
still live.

---

## 9 · Deliberately not done

**Configurable Workspace disposition — MAR-159.** Suspend-now, delete-now, and
never-touch, as an org setting with a per-deletion override. The chosen
disposition must be stored on the member row at delete time, not read from org
settings at purge time, or changing the setting retroactively changes what
happens to members already in the window.

**Removing deleted members from linked Google groups.** Leaving the *account*
live is not the same as leaving the member in the organization's Google
*groups*. As implemented, a deleted member keeps receiving everything sent to
`clenove@` for 30 days and stays visible in the directory.

The recommendation is to remove them from all linked Workspace groups at
soft-delete time — the `workspace_sync_operations` queue already performs
exactly that operation — while leaving the account untouched. That separates "no
longer part of the organization" from "can still fetch your files". It is not
implemented because it changes what an admin sees happen when they click delete,
and it should be a conscious call. **Open question.**

**A general retention job.** `docs/gdpr-review.md` §H2 wants per-table retention
policies (email activity, auth events, expired sessions, succeeded sync
operations). The member record now has one; nothing else does.

---

## 10 · Tests

`tests/member-erasure.test.ts` — identity erasure, the two identities that must
survive, restore-to-previous-status, the email-collision refusal, not-yet-due
members, and the no-anchor case.

`tests/member-workspace-purge.test.ts` — the disposal ordering, through a mocked
directory client: account deleted before the row, row survives a failed delete,
the stall cap, the disconnected-Workspace path, and no call for a member without
an account.

Both need a local Postgres and skip themselves when they cannot reach one.

One trap worth knowing if you extend them: `purgeDeletedMembers` is global
across organizations, so a member left behind by an earlier test in the same
file is still due and gets picked up by every later run. Assertions have to name
their subject — `expect(fn).not.toHaveBeenCalled()` will fail on somebody else's
row.
