# Live walkthrough — deleting and restoring members

A scripted session for testing member deletion with real people on real
screens, using dummy members. It doubles as a walkthrough: most administrators
have never seen what happens after they click Delete, and the point of the
feature is that they now can.

Companion to `docs/deleted-members.md`, which is the technical record.

---

## Before you start

**Who should be in the room.** One org admin, one group/scoped admin, and — if
the organization uses Google Workspace — whoever administers the directory.
The scoped admin matters: half of what is being tested is what they can and
cannot see, and an org admin cannot answer that by imagining it.

**What to prepare.**

| # | Dummy member | Why |
|---|---|---|
| 1 | Active, in a group the scoped admin manages, with a **personal email you can actually open** | The main path, and the deletion email lands somewhere you can read it |
| 2 | Active, in a group the scoped admin does *not* manage | Proves scoping still holds for deleted rows |
| 3 | **Archived**, any group | Proves restore returns them to *archived*, not active |
| 4 | Active, with a **Workspace account** (only if the org uses Workspace) | The account-survives-the-window path |
| 5 | An **org admin** — and make sure they are not the only one | The last-admin guard |

Use addresses you control. `+` addressing works: `you+dummy1@…`.

**Say this out loud before starting.** Nothing in this walkthrough is
irreversible on the day. Deletion is a 30-day window, everything here can be
undone with the Restore button, and the only step that cannot be undone (the
purge) is not run during the session. That framing matters — admins are
otherwise reluctant to click Delete on anything, and you will learn nothing.

---

## Part 1 · Deleting a member

**Do:** Members → dummy member 1 → Delete.

**Watch for:** does the admin hesitate before clicking? Does the confirmation
text tell them what they need to know, or do they ask a question it should have
answered?

**Ask afterwards:**
- "What do you think just happened to that person's record?"
- "How long do you think you have to change your mind?"
- "Where would you go to find them now?"

That last one is the real test. The row has vanished from the default view. If
the admin's first instinct is to search, or to assume the record is gone, the
filter is not discoverable enough.

**Then show them:** the status filter in the toolbar. Tick **Deleted**. The
member reappears with a `Deleted` badge and a "purges in 30 days" note.

**Ask:**
- "Does the dot-and-count control read as a filter to you?"
- "Would you have found this on your own?"
- "Untick everything except Deleted — is that what you would have tried?"

**Note the URL.** It now carries `?status=deleted`. Copy it, paste it in a new
tab, confirm the filter survives. Mention that it can be bookmarked or sent to
a colleague — see whether anyone finds that useful or surprising.

---

## Part 2 · The email the member gets

**Do:** open the inbox for dummy member 1's personal address.

**Read it with the group.** The email should say the membership ended, the date
the record is erased, and how to get in touch if it was a mistake.

**Ask:**
- "If you received this, would you understand what to do?"
- "Is the tone right for someone leaving your organization?"
- "Is anything missing that a departing member would want to know?"

**Check specifically:** does the language match what the organization would
actually say? The copy exists in English and Czech; confirm the Czech reads
naturally to a native speaker rather than as a translation. This is the one
piece of the feature that a member sees, and it is the piece most likely to be
wrong in a way only a native speaker notices.

---

## Part 3 · The scoped admin

**Do:** have the scoped admin sign in. Ask them to find the deleted member
themselves.

**Expect:**
- dummy member 1 (in their group) — visible when they tick Deleted, restorable;
- dummy member 2 (not in their group) — not visible at all, filter or no filter.

**Ask the scoped admin:**
- "Should you be able to see this person?"
- "Should you be able to bring them back, or should that need an org admin?"

This is a real open question, not a rhetorical one. The current answer is that
whoever could delete a member can restore them. If group leaders think restore
should be escalated, that is a finding worth writing down.

---

## Part 4 · Restore

**Do:** restore dummy member 1. Then restore dummy member 3 — the **archived**
one.

**Watch for:** member 3 must come back as **archived**, not active. If it comes
back active, that is a bug and the walkthrough should stop there — it would mean
a restored member silently rejoining the billing roster.

**Ask:**
- "Did that put them back the way you expected?"
- "Would you expect them to be signed in again, or to have to sign in?"
  (They must sign in again. Check whether that surprises anyone.)

**Optional, if you want to see the collision path:** delete a member, then
re-register someone through the join form with the same email address, then try
to restore. Restore refuses and names the address. Ask whether the message tells
them what to do next — the answer is that they must merge or rename the live
record first, and if the toast does not convey that, it needs rewording.

---

## Part 5 · The org admin guard

**Do:** try to delete dummy member 5 (an org admin) while they are the *only*
remaining admin. Then add a second admin and try again.

**Expect:** the first attempt is refused; the second succeeds.

**Ask:** "Was it clear why that was refused?" The rule is "an organization
always keeps at least one admin", not "admins cannot be deleted" — a board
member who resigns and asks for erasure must be removable. Check that the
message conveys the first rule and not the second.

---

## Part 6 · Workspace accounts

*Skip this part if the organization does not use Google Workspace.*

**Do:** delete dummy member 4, who has a Workspace account.

**Then, with the directory administrator watching, confirm in the Google Admin
console that the account is still active.** This is the part people expect to be
wrong, and seeing it with their own eyes is the point.

**Explain the policy:** the account keeps working for the full 30 days
specifically so the departing member can export their own mail, files and
photos. It is deleted along with the record at the end of the window.

**Ask — and this is the most valuable question in the whole session:**
- "Is that the behaviour you want?"
- "Would you rather the mailbox stopped immediately for someone removed for
  cause?"
- "Should this be a choice you make each time, or one setting for the whole
  organization?"

Making it configurable is already filed as MAR-159. What is being tested here is
whether the *default* is right and what the options should be.

**Then raise the open question directly** (see `docs/deleted-members.md` §9):

> Right now a deleted member keeps receiving everything sent to your shared
> group addresses — `clenove@` and the like — for the full 30 days, and stays
> visible in the staff directory. Should we remove them from those groups
> immediately, while leaving their personal account alive so they can still get
> their files out?

Nobody has decided this yet. The session is where it should get decided.

---

## Part 7 · The purge (demonstrate, do not run)

Do **not** run the purge against anything anyone cares about. Either skip it, or
run it on a scratch database with a dummy member whose `purge_after` has been
backdated.

**What to explain:**
- after 30 days, the Workspace account is deleted first, then the member record,
  then their login;
- if Google refuses, the member record is deliberately kept and retried — never
  deleted — because the record is the only thing that still knows an account
  needs removing;
- after five failures the member is reported as stuck and an administrator has
  to intervene.

**Ask:** "If a member got stuck like that, how would you want to hear about it?"
Today it is a line in the server log. Whether that is enough is a genuine
question, and the answer determines whether this needs a notification.

---

## What to write down

For each part, capture:

1. **Where they hesitated.** Hesitation marks unclear copy far more reliably
   than anything anyone says afterwards.
2. **What they expected that did not happen.** Especially around restore and the
   Workspace account.
3. **Anything they tried that did not work.** Attempts to select a deleted row,
   to edit one, to bulk-delete from the deleted view.
4. **The three open decisions**, each of which this session exists to settle:
   - should scoped admins be able to restore, or only see?
   - should deleted members leave Google groups immediately?
   - what should the default Workspace disposition be, and what options belong
     in the setting (MAR-159)?

---

## Cleanup

Restore or hard-delete every dummy member. Restoring is enough — they will
otherwise purge themselves in 30 days, which is fine, but a leftover dummy
appearing in a real membership report later is not.

Check that no dummy address is left subscribed to a live mailing list or Google
group.
