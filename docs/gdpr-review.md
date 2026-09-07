# GDPR review — Spoleek Core

Status: review of `main`/`legal` as of 2026-09-06, after MAR-7 (versioned legal documents)
landed. Scope is the whole application: schema, auth, member lifecycle, registration, the
member portal, admin surfaces, email, the Workspace integration, and the intended
Vercel + Neon deployment for TOP tým.

Companion to **`docs/legal-policies.md`**, which sets out the legal model (§2 in particular).
This document does not repeat that reasoning — it audits what the code actually does against
it, and against the parts of the Regulation that document does not cover: erasure, access and
portability, retention, residency, and sub-processors.

> **Not legal advice.** These are engineering findings with the article that motivates each
> one. The Czech-law questions — the stanovy's minimum age, what the spolek must retain and
> for how long, whether a DPIA is required — need a practitioner.

---

## 0. Deployment context that drives this review

Answered 2026-09-06:

- **Operator.** Deployment and operations are handled by a member of the organization, on the
  organization's behalf. Internally that means the org is the controller and the operator is
  its personnel, not a separate processor — but the platforms underneath **are** processors.
- **Hosting.** Vercel (application, cron) + Neon (Postgres). Resend for mail. Google Workspace
  where the module is enabled.
- **Tenancy.** Today: one deployment per organization. `getAppOrganization()`
  (`server/queries/app.ts:6`) resolves "the organization" as *the oldest row in the table* —
  there is no tenant resolution at all. A wildcard-DNS multi-tenant SaaS is on the roadmap;
  §6 covers what that changes.
- **Special-category data.** Membership of a political organization is Art. 9 data by nature
  (`docs/legal-policies.md` §2.1). Date of birth is captured. Health/dietary/accessibility
  fields are **not** configured today but the custom-field system lets an admin create them
  with no guardrail. National ID numbers for travel are a planned feature.

---

## 1. Verdict

The legal-document system is genuinely good — better than most products this size. Immutable
published versions, per-version acknowledgement rows with a `method` column, `restrict` on the
version foreign key, unchecked-by-default per-document consent boxes, no fabricated consent on
import, and a correct refusal to treat consent as the lawful basis for the register. That is
the hard half of GDPR and it is done.

**What is missing is the other half: the data subject's rights over data already held, and the
lifecycle of that data once it is no longer needed.** There is no access path, no export, no
working erasure, and no retention policy on anything except a 30-day soft-delete window.

| Area | State |
|---|---|
| Lawful basis & transparency (Art. 6, 9, 13) | **Strong** — model correct, texts still placeholders |
| Consent records (Art. 7) | **Strong** — versioned, evidenced, per-document |
| Right of access / portability (Art. 15, 20) | **Absent** |
| Right to erasure (Art. 17) | **Broken** — deletes the member, keeps the identity |
| Rectification (Art. 16) | Partial — self-service for name and custom fields only |
| Storage limitation (Art. 5(1)(e)) | **Absent** outside the 30-day purge |
| Data minimisation (Art. 5(1)(c)) | Mostly good; three specific leaks |
| Security (Art. 32) | Reasonable; residency unpinned, no read audit |
| Processors & transfers (Art. 28, 44) | **Not in place** |
| Accountability (Art. 5(2), 30, 35) | No RoPA, no DPIA |

---

## 2. Blockers — fix before the first real member record is loaded

### B1 · Erasure deletes the member but keeps the person

`purgeDeletedMembers()` (`server/lib/member-lifecycle.ts:116`) deletes the `tenant_members`
row 30 days after soft deletion. Nothing anywhere in the codebase ever deletes a row from
`users`, `accounts`, `sessions` or `verifications` — a repository-wide search for
`delete(users)` and friends returns nothing.

So after a member is deleted and purged, what survives indefinitely is:

- `users` — full name, email address, avatar URL
- `accounts` — the bcrypt password hash, and for Google sign-in the access token, refresh
  token and id token
- `sessions` — every session ever created, including `ip_address` and `user_agent`

`softDeleteMembers` nulls `tenant_members.userId`, which severs the link — so after the purge
the orphaned identity is not even reachable from the admin UI to be cleaned up by hand.

> **Art. 17.** Erasure that leaves a login, a password hash and an OAuth refresh token is not
> erasure. It is also an Art. 32 problem: those Google tokens keep working.

**Fix.** `purgeDeletedMembers` must, in the same transaction, delete the `users` row for a
purged member when that user has no other membership — which cascades `accounts` and
`sessions`. Add a Vitest case asserting no orphan `users` row survives a purge. MAR-55 (delete
the Workspace account) is the same finding one system further out.

### B2 · Org admins cannot be erased at all

`PROTECTED_MEMBER_ROLE = "org_admin"` (`server/lib/member-lifecycle.ts:7`) is filtered out of
**both** `softDeleteMembers` and `hardDeleteMembers`, with no override anywhere. A board member
who resigns and asks for erasure cannot be deleted through any code path in the application.

The guard is right in intent — it stops an admin from accidentally deleting the last admin —
but it is implemented as an absolute rather than a safety check.

**Fix.** Replace the role check with a "cannot delete the last remaining org admin" check, plus
an explicit demote-then-delete flow. Erasure requests must not require database access.

### B3 · Data residency is not pinned

`vercel.json` declares four cron jobs and **no `regions` key**. Vercel functions run in the
project's default region, which is US East unless the project is configured otherwise. The Neon
project's region is fixed at creation time and is not visible anywhere in this repository.

A Czech political organization's member register — Art. 9 data — being processed and stored in
the United States is a transfer question you do not want to have to answer after the fact.

**Fix, in order:**
1. Add `"regions": ["fra1"]` to `vercel.json` and set the project's function region to match.
2. Confirm the Neon project is in an EU region (`eu-central-1`); if it is not, it cannot be
   moved in place — create it correctly before loading real data.
3. Confirm Resend's processing region and record it.
4. Write the result down in the RoPA (B4). "We think it's in Europe" is not a record.

### B4 · No processor agreements, no records of processing

The organization is the controller. Vercel, Neon, Resend and Google are processors. Art. 28(3)
requires a written contract with each (all four publish a DPA — they need to be accepted and
filed, not assumed), and Art. 30 requires the organization to keep a record of processing
activities naming them.

This is MAR-132 and it is a long-lead, non-code item. It gates go-live, not the code.

### B5 · There is no way to answer an access or portability request

Nothing in the application produces a copy of one member's data. No export action, no admin
"download this member's record", no self-service in the portal. A member's data is spread over
`tenant_members`, `member_custom_field_values`, `group_memberships`, `member_payments`,
`member_policy_acknowledgements`, `member_auth_events`, `email_activities`,
`membership_report_members` and `workspace_group_member_links` — assembling it by hand under a
one-month deadline is not realistic, and doing it by hand means doing it inconsistently.

> **Art. 15** (access, one month) and **Art. 20** (portability, machine-readable).

**Fix.** One server-side `buildMemberDataExport(orgId, memberId)` that walks every table
holding a `memberId`, returning JSON. Surface it twice: an admin action on the member detail
page, and a self-service button in `/portal/profile`. The self-service version is the one that
actually saves you — most requests never become tickets if the member can just click.

Note the Art. 9(2)(d) condition here: the export goes to the data subject themselves, which is
not disclosure outside the body. **MAR-11 (general admin export) is a different thing and stays
blocked** on the separate opt-in.

### B6 · The published legal texts are placeholders

`seedOrganizationPolicies` deliberately writes an obvious "replace this" string. Correct choice
— but a deployment that goes live with it has no valid Art. 13 notice, and the portal gate will
force all 800 members to acknowledge a placeholder, burning the one moment you reliably have
their attention.

**Fix.** Real Czech texts, reviewed by a practitioner, published *before* the gate meets anyone.
Sequencing is in `docs/top-tym-delivery-handoff.md` §6.

---

## 3. High — fix before or shortly after go-live

### H1 · Personal data survives erasure in three tables

`onDelete` behaviour is currently the de-facto retention policy, and it was chosen per-column
for referential-integrity reasons rather than as a deletion decision. Two of those choices keep
personal data after the member is gone:

| Table | Column | On member delete | Effect |
|---|---|---|---|
| `email_activities` (`schema.ts:1249`) | `to_email`, `to_name` | `memberId` → null | Name and address of every email ever sent, kept forever, no longer attributable and therefore no longer findable |
| `membership_report_members` (`schema.ts:1545`) | `first_name`, `last_name`, `email` | `memberId` → null | The frozen roster snapshot keeps identifying data after erasure |
| `workspace_group_member_links` | `address` | `memberId` → null | Workspace address survives as a provenance record |

The report snapshot is arguably *defensible* — it is the evidence behind a statutory membership
report and freezing it is the whole point of the table. But defensible only if it is a written
retention decision with an end date, not an accident of a foreign key.

**Fix.** Decide each one explicitly and encode it: either the purge nulls the identifying
columns (keeping the row and its counts), or the retention job in H2 removes the row after the
statutory period. Write the decision into `docs/legal-policies.md` §11's retention section.

### H2 · Nothing has a retention period except soft-deleted members

`MEMBER_SOFT_DELETE_RETENTION_DAYS = 30` is the only retention rule in the codebase. Growing
without limit: `email_activities`, `email_activity_events`, `member_auth_events`, `sessions`,
`verifications`, `workspace_sync_operations` (including succeeded ones), `workspace_group_drift`.

> **Art. 5(1)(e).** "How long do you keep it?" currently has one honest answer: forever.

**Fix.** Extend the existing `/api/internal/purge-deleted-members` cron into a general retention
job with a per-table policy table, and surface the periods in the privacy notice. Suggested
starting points, for the practitioner to confirm: email activity 24 months, auth events 24
months, expired sessions and verifications immediately, succeeded sync operations 30 days.

The bigger open question is **post-membership retention of the member record itself** — a former
member of a political party is still someone the party may be obliged to have on a list for a
period. `deletedAt` exists; nothing reads it as a retention anchor. This is MAR-55/MAR-50
territory and it is a policy decision before it is code.

### H3 · Admins are never shown the privacy notice

The acknowledgement gate lives in `requireCurrentMemberAccess` (`server/queries/access.ts:543`)
and fires only when `member.status === "active"`. `requireAdminAccess` and
`requireOrgAdminAccess` do not call it.

An org admin or group leader who works entirely in `/admin` — which is exactly what they do —
never sees a policy prompt, and never generates an acknowledgement row. The people handling
everyone else's data are the only ones with no record of having been informed. Suspended and
archived members bypass it too, while still reaching the portal.

**Fix.** Run the gate in `requireAdminAccess` as well, and widen the status condition to every
status that can reach a logged-in surface.

### H4 · Custom fields have no notion of sensitivity

`member_custom_fields` (`schema.ts:917`) has `type`, `stage`, `discoveryMode`, `required` and
`constraints` — and nothing that says "this field holds special-category data". An org admin can
create a free-text field labelled *Health conditions* or *Dietary and accessibility needs* from
the settings UI, and the answers land in `member_custom_field_values.value` as plaintext `jsonb`
readable by every org admin and by every leader whose scope covers the member.

That is Art. 9 data with no separate lawful basis, no separate consent, no access restriction
beyond ordinary admin rights, no encryption and no retention rule.

It also blocks the roadmap: **the planned encrypted ID-number field cannot be built on this
model.** `lib/crypto.ts` today encrypts exactly one thing (the Workspace refresh token) with a
single key derived by a bare `sha256` of a passphrase (`lib/crypto.ts:15`) — no KDF salt, no key
version, therefore no rotation path.

**Fix, in this order:**
1. Add a `sensitivity` enum to `member_custom_fields` (`normal` | `special_category`), with the
   admin form requiring a stated lawful basis before a `special_category` field can be created.
2. Restrict reading those values to org admins, and log every read (H6).
3. Before the ID-number feature: give `lib/crypto.ts` a versioned key (`v1:<keyid>:<payload>`)
   and per-value encryption, so rotation is possible. Do this while there is one ciphertext in
   the database, not a hundred thousand.

### H5 · Minors are handled by nobody

TOP tým is a youth organization. There is no minimum-age validation on registration, no
under-age flag on the application, and no guardian-consent path. `submitJoinApplicationAction`
treats a 13-year-old exactly like an adult, and the record flows into the normal approval queue
where nothing tells the approver anything is unusual.

`docs/legal-policies.md` §2.4 already states the requirement — *under-age registrations are
flagged for manual handling, never auto-approved* — and it is not implemented. There is no
Linear issue for it.

**Fix.** A date-of-birth constraint that computes age at submission; an `underAge` signal on the
application; a visible banner in the approval UI; a place to record a guardian countersignature
(`policy_acknowledgement_method` already has room for `admin_recorded`).

### H6 · No record of who looked at member data

`member_auth_events` logs lifecycle actions — approvals, invites, provisioning. Nothing logs
*reads*. Any org admin, and any leader within scope, can browse the full register including
every custom field, and the system retains no trace.

> **Art. 5(2) accountability** and **Art. 32**. For special-category data this is the control
> that turns "our admins are trustworthy" into something you can demonstrate — and the control
> you need on the day someone asks who saw their record.

**Fix.** An append-only access log for member-detail views and any bulk read (member table
export, import preview, report screens): actor, member, timestamp, surface. Same retention
treatment as H2.

---

## 4. Medium

**M1 · Recipient addresses are written to stdout.**
`server/notifications/send.ts:70` logs `${params.kind} → ${recipient.email}` on every failure.
On Vercel that is personal data in a platform log store, retained under Vercel's policy rather
than yours, outside every retention rule you write. Log the member id instead.

**M2 · Payment QR tokens never expire.**
`app/api/payments/qr/[token]/route.ts` is unauthenticated by design — a mail client fetches it
with no session — and authorises on an HMAC token with no expiry. The PNG's SPD payload contains
the member's name. Anyone who ever receives, forwards or archives that email holds a permanent
URL to it. Add an expiry claim to the token, sized to the payment window.

**M3 · No key rotation path.** See H4.3.

**M4 · No breach runbook.** Art. 33 gives 72 hours from awareness. Decide now who is notified,
who assesses, what "awareness" means operationally, and where the ÚOOÚ form lives. This is a
page of text, and it is worthless written under pressure.

**M5 · Session lifetime is whatever Better Auth defaults to.**
`lib/auth/auth.ts` sets no `session` block, and `sessions` rows are never pruned. Set the
expiry deliberately and delete expired rows in the retention job.

**M6 · Erasure destroys the consent evidence.**
`member_policy_acknowledgements.memberId` cascades. Deleting a member therefore also deletes the
proof they were informed — which is correct for Art. 17 and inconvenient for Art. 5(2), and the
two genuinely pull against each other here. The defensible resolution is an aggregate: on purge,
increment a per-version counter rather than keeping the row. Whichever way it goes, it should be
a written decision rather than a foreign-key side effect.

**M7 · `/join` has no rate limiting.** The form accepts a name and email address about a person
from anyone who can reach the page. The enumeration response is handled carefully — a duplicate
submission is indistinguishable from a fresh one, which is a nice piece of work — but nothing
stops bulk submission of other people's details.

---

## 5. What to remove

Data you do not hold cannot be breached, exported, or asked about.

| # | Remove | Why |
|---|---|---|
| 1 | `sessions.ip_address` and `sessions.user_agent` | Written by Better Auth, **read by nothing** — a repo-wide search finds only the two schema lines. Collected without a purpose: Art. 5(1)(c). Disable the collection or start using it for a stated security purpose. |
| 2 | The `organization_policies` table | Down to two columns of invite-email copy since MAR-133. Move them to `organizations` and drop the table — it keeps a legal-sounding name over data that is not legal, which is exactly how the old mutable-consent model got built. |
| 3 | Orphaned `email_activities` rows | See H1. Null the name and address once the member is purged. |
| 4 | Expired `verifications` rows | Password-reset and activation tokens with no cleanup. |
| 5 | Succeeded `workspace_sync_operations` | Each row holds a member's email address as `address`; once succeeded it has no operational value. |
| 6 | Free-text `admin_note` / `notes` / `cancellation_reason` on `member_payments` | Not removable — but free text on a member's financial record is where unnecessary personal data accumulates, and none of it is covered by any retention rule. At minimum, say so in the field's help text. |
| 7 | The duplicated cron-auth block in `app/api/internal/purge-deleted-members/route.ts` | `server/lib/cron-auth.ts` exists for this. Not a GDPR finding — but this is the endpoint that performs deletions, and it should not have its own copy of the authorisation logic. |

---

## 6. The multi-tenant SaaS roadmap changes the risk profile

Today `getAppOrganization()` returns *the oldest organization row in the database*. There is no
hostname resolution, no tenant context in the session, and `orgId` filtering — while applied
consistently in the query layer, which is genuinely well done — is defence in depth rather than
the boundary, because there is only ever one tenant.

Under wildcard-DNS SaaS, every organization's member register sits in one database, and a single
missing `eq(table.orgId, ...)` in one query leaks the membership roster of a political party to
another tenant. That is an Art. 9 breach with a notification duty attached, caused by one
forgotten `where` clause.

**Before that ships:**

1. **Postgres row-level security**, with the tenant set per connection — so the boundary is
   enforced by the database rather than by every developer remembering. Convention plus review
   is not sufficient for special-category data across tenants.
2. Tenant resolution from the hostname, with `getAppOrganization()` removed outright rather than
   left as a fallback — a fallback here silently returns *someone else's* organization.
3. A controller/processor decision per deployment mode. In SaaS mode the operator holds many
   organizations' data and is unambiguously a processor for each, with a DPA per customer.
4. Cross-tenant tests as a standing suite, not a one-off audit.

---

## 7. Sequenced plan

**Before the first real member record**

1. B3 residency — `fra1` + confirm the Neon region *(cannot be fixed in place afterwards)*
2. B4 processor agreements and RoPA *(long lead, not code — start now)*
3. B1 erasure completeness + regression test
4. B2 removable admins
5. B6 real legal texts, published before the gate meets anyone

**Before go-live**

6. B5 member data export — admin action + portal self-service
7. H3 gate admins on acknowledgement
8. H5 minors: age computation, under-age flag, approval banner
9. M4 breach runbook
10. M1 stop logging addresses

**First month after**

11. H2 retention job with a per-table policy
12. H1 decide and encode the three post-erasure residues
13. H6 read-access audit log
14. M2 QR token expiry, M5 session lifetime, §5 removals 1–5

**Before the features that depend on them**

15. H4 field sensitivity + versioned encryption → gates the ID-number feature
16. §6 row-level security → gates multi-tenant SaaS
17. Separate opt-in consent model → gates MAR-35 and MAR-11
18. A DPIA — Art. 35 is likely engaged by large-scale processing of political-opinion data;
    confirm with the practitioner

---

## 8. Credit where it is due

Worth stating explicitly, because a findings list reads as if nothing works:

- Consent is **not** used as the basis for the register, and the reasoning for that is written
  down (`docs/legal-policies.md` §2.1). Most systems get this backwards and build an
  unhonourable withdrawal right.
- Published policy versions are immutable, with `restrict` on the acknowledgement foreign key
  so evidence cannot be deleted out from under a record.
- The `method` column distinguishes a real click from an admin-recorded paper signature.
- Import does not fabricate consent, and MAR-129 removed a path that previously did.
- Registration checkboxes are per-document, unchecked by default, and revalidated server-side
  against what the organization has actually published.
- Policy notification emails are never automatic.
- The duplicate-registration path is written to avoid address enumeration.
- No analytics, no tracking, no third-party scripts. Every cookie in the application is
  strictly necessary — which is why there is no cookie banner, and correctly so.
