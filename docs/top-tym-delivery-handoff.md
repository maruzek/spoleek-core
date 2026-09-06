# TOP tým delivery — handoff

What has to be finished before Spoleek is handed to TOP tým, a Czech youth political
organization that will run its member register in it.

Status as of 2026-09-06. Linear states are quoted where they exist; anything without an issue
number is a deployment step rather than a ticket.

The ordering principle throughout: **an org will forgive a missing feature and will not forgive
a wrong number, a mis-sent email, or a legal exposure.** That is why the money and the legal
sections come first even though the feature backlog is longer.

## 0. What just shipped

The versioned legal-document system (MAR-7) is complete on the code side. Seven sub-issues
closed today: MAR-124 schema and backfill, MAR-125 editor and sanitizer, MAR-126 Legal settings
tab, MAR-127 public and archived pages, MAR-128 portal gate, MAR-129 registration and import
rewiring, MAR-133 legacy column drop, plus MAR-130 member notification.

Design and reasoning: **`docs/legal-policies.md`**. Read §2 before touching any of it — the
GDPR analysis is what determines the schema, and it is not obvious.

Two things it changed that affect the delivery directly:

- **Consent was being fabricated.** `member-admin.ts` stamped a consent timestamp whenever an
  imported or admin-created member matched a Google account — conflating "has a login" with
  "gave consent". Fixed in MAR-129. Any pre-existing timestamps in a production copy of the
  data are not trustworthy; the columns are now dropped.
- **The portal is gated.** Every member is stopped at `/portal/legal` until they respond to
  each published document. On go-live this is intended and it will hit **everybody at once**.
  See §6 for the order that makes it land well.

## 1. Legal — blocks the handover, and not all of it is code

| # | What | State |
|---|------|-------|
| 1 | **[MAR-132](https://linear.app/maruzek/issue/MAR-132) — data processing agreement** | Backlog, Urgent |
| 2 | Real Czech texts for the terms and the privacy notice | no issue |
| 3 | [MAR-50](https://linear.app/maruzek/issue/MAR-50) — GDPR review (erasure, export) | Todo, Medium |
| 4 | [MAR-55](https://linear.app/maruzek/issue/MAR-55) — delete Workspace account on member delete | Todo, Medium |

**MAR-132 is the long-lead item and it is not code.** If you host the instance, hold the
database, or can SSH in, you are a processor under Art. 28 and need a written zpracovatelská
smlouva signed **before the first real member record is loaded**. It must name the
sub-processors: the VPS provider, Resend, Google Workspace. Decide deliberately whether you are
a processor or only a software supplier — the second position ends the moment anyone SSHes in
to fix something, so write down how support access will actually work.

**The legal texts are currently placeholders.** `seedOrganizationPolicies` deliberately writes
an obvious "replace this" rather than plausible-looking prose, because a plausible default is
one nobody reads and nobody replaces. TOP tým's real texts go in through the Legal settings tab
before go-live. They need review by a Czech practitioner: membership of a political
organization is special-category data under Art. 9, and the exemption relied on
(Art. 9(2)(d)) carries a condition — the data must not be disclosed outside the body without
consent.

That condition is a live constraint on two backlog items: [MAR-35](https://linear.app/maruzek/issue/MAR-35)
public member profiles and [MAR-11](https://linear.app/maruzek/issue/MAR-11) export both need a
separate, genuinely optional opt-in before they can ship. Do not fold that into the
registration checkbox.

**Minors.** TOP tým is a youth organization. Decide the minimum age from the stanovy and how
guardian consent is handled for the youngest members. Date of birth is already captured and
constrainable ([MAR-98](https://linear.app/maruzek/issue/MAR-98), done). The concrete ask:
under-age registrations should be flagged for manual handling, never auto-approved. No issue
exists for this yet.

## 2. Money — wrong numbers destroy trust faster than missing features

| # | What | State |
|---|------|-------|
| 1 | **[MAR-118](https://linear.app/maruzek/issue/MAR-118) — "fees collected" is a plain sum, not the real remittance** | Todo, High |
| 2 | [MAR-66](https://linear.app/maruzek/issue/MAR-66) — payment edge cases (member changes payment group) | Todo, Medium |

MAR-118 is the sharpest remaining non-legal blocker. The treasurer will reconcile against the
bank in the first week and find the app disagreeing with reality. Fix it before anyone sees
the number.

MAR-66 matters specifically because TOP tým is regional and members move between regions. It
will fire within the first month and silently mis-assign fees.

## 3. Email — the organization's outward face

| # | What | State |
|---|------|-------|
| 1 | [MAR-77](https://linear.app/maruzek/issue/MAR-77) — sender name + env rework | **In Progress**, High |
| 2 | [MAR-119](https://linear.app/maruzek/issue/MAR-119) — who-gets-what notification summary | Todo, Urgent |
| 3 | [MAR-70](https://linear.app/maruzek/issue/MAR-70) — preferred email personal/workspace | **In Progress**, Medium |
| 4 | Bounce visibility — the "undeliverable member" item from [MAR-107](https://linear.app/maruzek/issue/MAR-107) | Backlog |

MAR-77 is nearly done and cheap: registration mail arriving from a placeholder sender is an
instant credibility loss with new members.

MAR-119 is the one to take seriously before go-live. You need to be able to state, on paper,
which admin receives which email — otherwise the first registration wave notifies the wrong
regional board. This matters more now than it did this morning: the policy notification added
in MAR-130 can reach the entire membership in one click, and the gate makes registration
traffic spike on day one.

MAR-70 decides which of a member's two addresses gets used. Getting it wrong sends mail to a
mailbox nobody reads. The policy notification already routes through `preferredEmail`, so this
is shared plumbing.

Only the bounce-visibility item from MAR-107 is needed; the rest of that inventory can wait.
In a member database, a silently bounced address means an unreachable member and nobody knows.

## 4. Data migration — one-time, but a failure stalls the whole handover

| # | What | State |
|---|------|-------|
| 1 | [MAR-103](https://linear.app/maruzek/issue/MAR-103) — import groups from Google | Todo, High |
| 2 | [MAR-106](https://linear.app/maruzek/issue/MAR-106) — audit Workspace directory against Spoleek | Todo, Medium |
| 3 | [MAR-11](https://linear.app/maruzek/issue/MAR-11) — member export | Todo, Medium |

Their regional structure already lives in Workspace groups, so MAR-103 saves re-keying it by
hand. MAR-106 is the verification tool for the import — without it you are eyeballing hundreds
of rows.

MAR-11 is the psychological safety net that lets an org commit to a new system: they need to
know they can get their data back out. Note the Art. 9(2)(d) constraint in §1 before building
it.

## 5. First-week admin workflow

The onboarding wave means admins live in the pending-approvals screen, and every member meets
the join form exactly once.

- [MAR-52](https://linear.app/maruzek/issue/MAR-52) pending members first in tables · [MAR-53](https://linear.app/maruzek/issue/MAR-53) pending card on dashboard · [MAR-44](https://linear.app/maruzek/issue/MAR-44) admin quick actions
- [MAR-110](https://linear.app/maruzek/issue/MAR-110) declutter forms (Urgent) · [MAR-58](https://linear.app/maruzek/issue/MAR-58) group category form validation bug · [MAR-23](https://linear.app/maruzek/issue/MAR-23) join form header · [MAR-45](https://linear.app/maruzek/issue/MAR-45) login clarity

None of these individually blocks a deploy. Collectively they are what the org's impression of
the app is made of in week one.

## 6. Deployment runbook

Order matters here, and one step is easy to get backwards.

1. **Environment.** `DEFAULT_LOCALE=cs`, `APP_URL` set to the real host (the policy emails
   build absolute archived-version links from it), `DATABASE_URL`, Resend credentials.
2. **Migrations.** `pnpm db:migrate` — the legal work added `0045`–`0050`. `0049` carries a
   guard that refuses to drop the old consent columns if the `0046` backfill did not run, so a
   failure there is informative, not mysterious.
3. **Check `organizations.locale`.** It is seeded from `DEFAULT_LOCALE`, but a row created
   before that seeding existed holds `'en'` and the document titles follow it. This bit us
   locally; migration `0047` repairs it where `members_sort_locale` shows Czech intent.
4. **Publish the real legal texts** in the Legal settings tab, replacing the placeholders.
5. **Then import the members** ([MAR-72](https://linear.app/maruzek/issue/MAR-72), done).

   **Publish before importing, not after.** The import itself changes the set of processors and
   recipients — new host, Resend, Google — which is a material change to the privacy notice and
   triggers a fresh Art. 13/14 duty to inform. Publishing first means the imported members are
   covered by a current notice rather than retroactively patched.

6. **Expect the gate to catch everyone.** Imported members have no acknowledgement rows by
   design, so every one of them is stopped at `/portal/legal` on first login. That is the
   intended behaviour and the reason the import is lawful without fabricating consent — but the
   board should be told it will happen, so it does not read as a bug.
7. **Optionally notify** from the publish dialog. The checkbox is off by default and states the
   exact recipient count. Nothing is ever sent automatically.

## 7. Known risk with no issue

**[MAR-79](https://linear.app/maruzek/issue/MAR-79)** (Backlog, `edgecase`): a user from the
org's Google domain signs in with no user account and no member record. TOP tým *has* a live
Workspace domain, so someone will do this in week one. Worth promoting to a real issue and
deciding the behaviour deliberately rather than discovering it in production.

## 8. Explicitly not before delivery

Events (MAR-14), voting (MAR-16), wiki (MAR-13 / MAR-120), skills registry (MAR-123), mobile
app (MAR-99), statistics (MAR-32), bank CSV pairing (MAR-82), off-boarding (MAR-102), roll-up
Workspace groups (MAR-104), Sentry and PostHog (MAR-87 / MAR-88), full i18n (MAR-8), setup
wizard completeness (MAR-75 / MAR-94 / MAR-95 — you are running the setup yourself, so a rough
wizard is acceptable), and [MAR-131](https://linear.app/maruzek/issue/MAR-131) acknowledgement
coverage reporting.

MAR-131 is worth doing soon after launch rather than before: it is what lets an admin see who
has not responded, and it carries `admin_recorded` consent for members who sign on paper at a
regional meeting. Neither is needed on day one.
