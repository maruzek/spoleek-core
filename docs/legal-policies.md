# Legal policies — versioning, consent & GDPR design

Status: planned. Nothing below is implemented yet; MAR-7 and its sub-issues track the work.

Written for the TOP tým deployment (a Czech youth political organization running its member
register in Spoleek), but the model is deliberately org-agnostic.

> **Not legal advice.** The reasoning here determines the *schema and the flows*, which is why
> it is written down. The finished Czech-language texts still need review by a practitioner
> before go-live.

## 1. Where we are today

A snapshot of legal text exists, but not a policy system:

- `organization_policies` (`server/db/schema.ts:527`) — **one mutable row per org**
  (`uniqueIndex` on `orgId`). `termsOfServiceText` / `privacyPolicyText` are plain `text`,
  alongside the labels and the invite-email copy.
- `version` (`schema.ts:551`) defaults to `"v1"` and **no code path ever bumps it**.
  `saveJoinPageSettingsAction` (`server/actions/organization-settings.ts:44`) overwrites the
  text in place and leaves `version` alone.
- Consent is captured in exactly one place: `server/actions/join.ts:123` stamps
  `acceptedTermsAt`, `acceptedPrivacyAt` and `acceptedPolicyVersion` on the member row.
- Public pages `app/legal/terms/page.tsx` and `app/legal/privacy/page.tsx` render the current
  text with `whitespace-pre-line`.
- Admin editing is two `<Textarea>`s inside the **join** settings tab.

| # | Gap | Consequence |
|---|-----|-------------|
| 1 | Published text is mutated in place | Every edit destroys the evidence. `acceptedPolicyVersion: "v1"` starts pointing at text that no longer exists anywhere |
| 2 | `version` never changes | Two members who accepted materially different documents are indistinguishable |
| 3 | No re-consent path | A policy change can never reach existing members |
| 4 | Consent only on `/join` | Imported (MAR-72) and admin-created members have no lawful way to be shown anything |
| 5 | One ToS + one privacy notice, hardcoded | No room for a third document (stanovy, photo consent, code of conduct) |
| 6 | Terms and privacy notice treated identically | They are legally different instruments — see §2.2 |
| 7 | Plain text only | Legal documents need headings, lists and links to be readable at all |
| 8 | Legal text lives in the join settings tab | Undiscoverable, and implies these documents only concern registration |

The core defect is #1. Everything else follows from it.

## 2. Legal model

### 2.1 Consent is *not* the lawful basis for the member register

The intuitive design — "members consent, therefore we may hold their data" — is wrong here,
and building it would create an obligation the organization cannot honour.

For a Czech political organization the bases are:

- **Art. 6(1)(b)** — necessary for the membership relationship (a contract). Covers the
  register itself, contact details, fees, group assignments.
- **Art. 6(1)(c)** — legal obligation. Political parties must maintain a member list
  (zák. č. 424/1991 Sb.); for a spolek it depends on the stanovy (§ 236 OZ).
- **Art. 9(2)(d)** — the decisive one. Membership of a political organization *reveals
  political opinions*, so this is special-category data. The route open to us is the
  not-for-profit-body-with-a-political-aim exemption, which permits processing the data of
  members, former members and regular contacts **on condition that the data is not disclosed
  outside the body without the data subject's consent.**

Consequences that land directly in the code:

1. **Do not ask for consent to hold member data.** Consent is withdrawable; if a member
   withdrew it we would have to delete a register we are legally required to keep.
2. **What is actually owed is transparency** (Art. 13/14). The privacy notice is a
   *disclosure*, not an agreement. The provable fact must be *"was shown it, on this date"*.
3. **Art. 9(2)(d)'s no-disclosure condition is a hard gate on future features** — public
   member profiles (MAR-35), member export (MAR-11), any third-party sharing. Those need
   separate, genuinely optional, opt-in consent, and must never be folded into the
   registration checkbox.

### 2.2 Two kinds of document

|  | **Terms / membership rules** | **Privacy notice** |
|---|---|---|
| Nature | An agreement | An information disclosure |
| Member's act | Accepts | Confirms having read |
| Evidence stored | Who accepted which version, when | Who was shown which version, when |
| Wording | "I accept…" | "I confirm I have read…" |
| On a new version | Re-acceptance | Re-notification |

`requiresAcceptance` on `policy_documents` carries this distinction.

**Deployment decision (2026-09-06):** both kinds **block the portal** until the member has
acted on the current version. Legally a privacy notice does not have to be gated, and gating
it slightly weakens the "informed" story (people click through). It is nonetheless what we
ship, because the alternative — a dismissible banner — means in practice that a large share of
members are never provably informed at all, and a login-time interstitial is the only moment
we reliably have their attention. The **wording still differs** per the table above: we never
ask anyone to "agree to" a factual disclosure.

### 2.3 Controller / processor

TOP tým is the **controller**. Spoleek's operator is a **processor** under Art. 28 if it hosts
the instance, holds the database, or has admin/SSH access — which requires a written
zpracovatelská smlouva **before the first real member record is loaded**, covering subject
matter, duration, purpose, data categories, sub-processors, security measures and deletion on
termination.

Current sub-processors to name in it: the VPS provider, Resend (MAR-26), Google Workspace.
MAR-87 / MAR-88 (Sentry, PostHog) would each add one.

If instead the org self-hosts on infrastructure the operator cannot reach, the operator is a
software supplier rather than a processor — but that ends the moment anyone SSHes in to fix
something. **This has to be decided deliberately and written down; it is a document, not a
feature.**

### 2.4 Minors

Art. 8's 15/16-year consent threshold applies to consent for information-society services, so
with a contract basis it largely does not bite. But for a *youth* organization the stanovy's
minimum age and a guardian countersignature for the youngest members are real. Date of birth
is already captured and constrainable (MAR-98).

**Requirement:** under-age registrations are flagged for manual handling, never auto-approved.

## 3. Data model

The rule the whole design rests on: **a published version is immutable.** Editing a published
version creates a new draft. That is what turns `acceptedPolicyVersion` from a dangling string
into a foreign key onto text that still exists verbatim.

```
policy_documents
  id, orgId -> organizations.id (cascade)
  kind      enum('terms','privacy','other')
  slug      text        -- public URL segment, unique per org
  title     text
  requiresAcceptance boolean   -- true: "I accept"; false: "I confirm I have read"
  isActive  boolean default true
  sortOrder integer
  unique (orgId, slug)

policy_versions
  id, documentId -> policy_documents.id (cascade)
  version          text         -- admin-facing label, e.g. "2.0", "2026-09"
  bodyHtml         text         -- sanitized at publish time, never re-transformed
  summaryOfChanges text
  status           enum('draft','published','archived')
  isMaterialChange boolean default true
  effectiveFrom    timestamptz
  publishedAt, publishedByUserId -> users.id (set null)
  unique (documentId, version)
  partial unique (documentId) where status = 'draft'

member_policy_acknowledgements
  id, orgId, memberId -> tenant_members.id (cascade)
  policyVersionId -> policy_versions.id (restrict)
  acknowledgedAt timestamptz
  method enum('registration','portal_prompt','admin_recorded','import_notice')
  unique (memberId, policyVersionId)
```

Notes:

- **`restrict` on `policyVersionId`**, not cascade. Deleting a version that people accepted
  must be impossible; that is the point of the table.
- **`method`** keeps us honest about a paper form signed at a regional meeting versus a click
  in the app. Without it, `admin_recorded` is indistinguishable from a real click.
- **`isMaterialChange`** exists so a typo fix does not re-prompt 800 people. It is the
  admin's call at publish time, and it is a per-version fact, so the reason a given cohort was
  re-prompted stays auditable.
- **`bodyHtml` is stored post-sanitization.** Archived versions render straight from this
  string and are never passed back through a current-day pipeline — otherwise "immutable"
  quietly changes when a dependency is upgraded.
- `organization_policies` **keeps** `memberInviteEmailSubject` / `memberInviteEmailBody`.
  They are not legal documents and should not be dragged into version control. The four
  `termsOfService*` / `privacyPolicy*` columns are dropped after the backfill.

### 3.1 Migration & backfill

1. Create the three tables.
2. For each org, create a `terms` and a `privacy` document from the existing labels.
3. Create one `published` version each, `bodyHtml` = the existing plain text wrapped in
   paragraphs, `version` = the existing `organization_policies.version`, `effectiveFrom` =
   the org's `createdAt`, `isMaterialChange = true`.
4. For every member with a non-null `acceptedTermsAt`, insert acknowledgement rows against
   those v1 versions with `method = 'registration'`.
5. Drop the four text columns and `version` from `organization_policies`.
6. Update `scripts/seed.ts:25` and the setup/bootstrap paths
   (`server/actions/setup.ts:76`, `server/actions/bootstrap.ts:468`).

Members with a null `acceptedTermsAt` get **no rows**. See §5.

## 4. The portal gate

The precedent already exists: `requireCurrentMemberAccess`
(`server/queries/access.ts:519`) gates on profile completeness and redirects to
`/portal/profile?incomplete=1`.

The policy gate goes in the same function and **runs first** — legal obligations precede
profile hygiene, and a member should not be asked to fill in custom fields before being told
how their data is handled.

```
requireCurrentMemberAccess({ requirePolicyAcknowledgement: true })
  -> outstanding = published docs with no acknowledgement row for the current version
                   (only versions where effectiveFrom <= now)
  -> if outstanding.length: redirect("/portal/legal")
  -> then the existing requireProfileComplete check
```

`/portal/legal` presents the outstanding documents one after another, each rendering the full
`bodyHtml` with a single action at the end — "I accept" or "I confirm I have read", per
`requiresAcceptance`. On submit it writes one acknowledgement row per document with
`method = 'portal_prompt'`.

Non-material versions never enter `outstanding`: the member keeps their acknowledgement of the
previous version, and the current text is still what `/legal/<slug>` serves.

Admins who are not members are unaffected — they have no `tenant_members` row and take the
`/admin` branch at `access.ts:535`.

## 5. Imports (MAR-72) — the rules

Moving a member register from spreadsheets into Spoleek is a **change of system, not a change
of purpose or lawful basis**. No new consent is required, and asking for one would be wrong:
it implies the previous processing was unlawful and hands members a withdrawal right over a
register that must be kept.

1. **Never backdate.** Imported members get no acknowledgement rows and a null
   `acceptedTermsAt`. Synthesising a consent that never happened is worse than an empty
   record — it is the one thing that reads as bad faith.
2. **Mark them distinctly.** The admin screen must show *"312 members have not yet been shown
   the current privacy notice"*, not a blank date.
   `components/app/member-detail/member-overview-tab.tsx:253` currently renders an empty value
   here and should say why it is empty.
3. **Collect at first login** via the §4 gate, which imported members hit automatically
   because they have no rows at all.
4. **What *does* change is the set of recipients and processors** — a new processor, a new
   host, Resend, Google. That is a material change to the privacy notice and triggers a fresh
   Art. 13/14 duty to inform, which the org discharges by publishing the new version before
   the import.

## 6. Notifying members

The controller owes the notification, so **the decision to send is the org's** — but they will
not run a correct mail-merge over 800 addresses by hand, and if the app does not offer it, it
will not happen.

The publish dialog therefore carries the action explicitly:

```
Publishing "Privacy notice" v2.0
  312 members acknowledged v1.0 · 94 have never been shown a notice

  [x] Material change — members must acknowledge before using the portal
  [ ] Email affected members now          preview · 406 recipients
```

**Never send automatically on save.** An accidental blast to the entire membership of a
political party is not a bug that gets recovered from socially.

The email states the document, the version, what changed (`summaryOfChanges`), and links to
the public page. It routes through `preferredEmail` and logs to `emailActivities` like every
other message. Related: MAR-119 (who gets which notification).

## 7. Editor

**Tiptap**, with a deliberately narrow schema: `h2`, `h3`, `p`, `ul`, `ol`, `bold`, `italic`,
`link`. Nothing else. Legal documents need exactly these, and a narrow schema keeps the stored
HTML stable enough to render identically in five years — which is the actual requirement, not
editing comfort.

Non-negotiable regardless of editor: **sanitize server-side at publish time** (allow-list
matching the schema above, `rel="noopener noreferrer"` forced on links) and store the result.
Client-side sanitization is a rendering nicety, not a control.

Public rendering uses `@tailwindcss/typography` `prose` classes. Both are new dependencies.

## 8. Public pages

- `/legal/<slug>` — the current published version.
- `/legal/<slug>/v/<version>` — an archived version, verbatim.

The archived route is what makes an acknowledgement record meaningful: a member can see
exactly the text they accepted, and so can a regulator. Every acknowledgement in the admin UI
links to it.

The existing `/legal/terms` and `/legal/privacy` become redirects to the seeded slugs so
existing links and the join form keep working.

## 9. Settings tab

A new **Legal** tab in `components/app/admin-settings-tabs.tsx` — add to `VALID_TABS:57`;
`FileTextIcon` is already imported there.

- Document list: title, kind, current version, acknowledgement coverage
  (*"406 / 500 members on current version"*), draft badge.
- Version history per document, each linking to its public archived page.
- Draft editor → publish dialog (§6).
- Per-document: create, rename, deactivate. Deleting a document that has acknowledgements is
  refused; deactivating hides it from the gate and the public index while keeping the record.

`termsOfService*` / `privacyPolicy*` come out of `joinPageSettingsSchema` (`lib/join.ts:40`)
and out of the join tab.

## 10. Sequencing

| Phase | Work | Blocking for TOP tým go-live? |
|---|---|---|
| 1 | Schema, migration, backfill | Yes |
| 2 | Tiptap editor + sanitizer + publish flow | Yes |
| 3 | Legal settings tab | Yes |
| 4 | Public `/legal/<slug>` + archived versions | Yes |
| 5 | Portal acknowledgement gate | Yes |
| 6 | Registration flow rewire | Yes |
| 7 | Notify-members action | No — import can be announced manually once |
| 8 | Admin coverage reporting / `admin_recorded` | No |

Phases 1–2 are the real blockers; everything downstream is mechanical once versions are
immutable.

## 11. Deliberately out of scope

- **Multi-language documents.** One text per version; i18n of legal content is MAR-8 territory
  and a translated policy raises "which language governs" questions we should not answer
  casually.
- **Granular per-purpose consent** (photos, newsletter, public profile). Needed before MAR-35
  and MAR-11 ship, but it is a separate opt-in model and must not be merged into the
  registration checkbox — see §2.1.
- **Retention scheduling.** The org should set a post-membership retention period; the
  `deletedAt` column exists but nothing acts on it. Related: MAR-55, MAR-50.
- **PDF export of an accepted version.** Nice for disputes, not needed to be lawful.
