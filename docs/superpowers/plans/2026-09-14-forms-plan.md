# Forms — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-14-forms-design.md`
**Date:** 2026-09-14

Seven phases, each ending in a green `pnpm typecheck && pnpm lint && pnpm test`
and a commit. Phases 1–3 have no UI; UI starts in phase 4. Every phase lists
the existing code it copies from — read that file before writing the new one.
The events core (`server/actions/events.ts`, `server/queries/events.ts`,
`server/lib/events/*`, `components/app/events/*`) is the closest sibling and
the default pattern wherever this plan does not name another.

Steps marked **[you]** embody a product decision with more than one valid
answer; the scaffold (file, signature, tests) is prepared first and the body is
left for you to write.

---

## Phase 1 — Schema and migration

**Files:** `server/db/schema.ts`, `server/db/migrations/*` (generated).

1. Enums after `eventRsvpStandingEnum`: `formTimingEnum`, `formStatusEnum`,
   `formVisibilityEnum`, `formQuestionKindEnum`, `formProfileSyncEnum`,
   `formAudienceKindEnum`, `formAudienceScopeEnum` — values per spec.
2. Add `form_reminder` to `emailKindEnum` with a comment (explicit-only, like
   `event_invite`).
3. Tables after `eventRsvpTokens`: `forms`, `formQuestions`, `formAudience`,
   `formSubmissions`, `formAnswers`, with every CHECK, partial unique index
   and plain index from the spec. Copy the doc-comment style from `events` /
   `eventAudience`: one paragraph per table saying *why* — templates are
   copies, linked questions carry a snapshot of the field's type, answers to
   special-category questions live only in `encryptedValue`.
4. Export row types (`Form`, `FormQuestion`, `FormSubmission`, `FormAnswer`,
   `FormAudienceRule`) next to the event ones.
5. `pnpm db:generate`; read the SQL; confirm the `lower(guest_email)` partial
   index and the special-category CHECK. `pnpm db:migrate` locally.

**Done when:** migration applies on a fresh and on the seeded DB; typecheck
green.

---

## Phase 2 — Pure modules

**Files:** `lib/forms/rules.ts`, `lib/forms/validation.ts`,
`lib/forms/profile-sync.ts`, `lib/forms/schemas.ts`,
`lib/events/eligibility.ts`, tests `tests/forms-rules.test.ts`,
`tests/forms-validation.test.ts`, `tests/forms-profile-sync.test.ts`,
`tests/events-eligibility.test.ts`.
**Pattern:** `lib/events/rsvp.ts` + `tests/events-rsvp.test.ts`.

1. `lib/forms/rules.ts`:
   - `isFormOpen(form, event | null, now): { open: true } | { open: false; reason: "draft" | "closed" | "deadline_passed" | "event_cancelled" | "event_deleted" }`
   - `getFormPlacement(form, event | null, now): "inline_after_rsvp" | "pending" | "listed"` **[you]** — when does a
     `before_event` form stop nagging, and does `after_event` nag before the
     event ends at all? The spec gives the default reading; encode the one
     you want and the tests will pin it.
   - `canSubmit({ form, event, viewer }): { ok: true } | { ok: false; reason: "FORM_CLOSED" | "NOT_ELIGIBLE" | "RSVP_REQUIRED" }`
     — `viewer` is `{ kind: "member", eligible, rsvpAnswer }` |
     `{ kind: "token", rsvpAnswer }` | `{ kind: "guest" }`.
   - `isPending({ form, event, viewer, hasSubmission, now })`.
   - `getShredAnchor(form, event | null): Date | null` and
     `isShredDue(question, anchor, now)`.
2. `lib/forms/validation.ts`: `validateSubmission({ questions, liveFieldsById,
   answers })` → `{ ok: true; values: Map<questionId, CustomFieldValue> } |
   { ok: false; errors: Record<questionId, string> }`. Reuse
   `normalizeFieldInputValue` from `lib/member-custom-fields.ts`; for a linked
   question substitute the live field's `type`/`options`/`constraints`.
3. `lib/forms/profile-sync.ts`: `resolveProfileWrites({ questions, values,
   syncFlags, identityKind })` → `Array<{ fieldId, value }>` **[you]** — decide
   what `offer_checked` means when the member explicitly unticks and what
   happens when the answer is empty (clear the profile value, or leave it?).
   Also `validateQuestionLink(question, field | null)` returning the
   `QUESTION_LINK_INVALID` reason: special-category, `admin_only` stage,
   inactive field, type mismatch after a field type change.
4. `lib/forms/schemas.ts`: Zod per spec. `formQuestionSchema` is a
   discriminated union on `kind`; `.superRefine` mirrors the DB CHECKs so the
   editor gets field-level messages instead of a constraint violation.
5. `lib/events/eligibility.ts`: add `scope?: "members" | "admins"` to
   `AudienceRule`; `resolveEligibleMemberIds` filters group/category rules by
   `group_memberships.role = 'group_admin'` (and, for category `admins`, the
   category-admin relation the query layer already loads for
   `listScopedCategoryIds`). Default `members`; existing tests must not
   change.
6. Tests first, then bodies. Cases from the spec's Testing section.

**Done when:** all four test files green; no imports from `server/`.

---

## Phase 3 — Access, answers, queries, actions, cron, email

**Files:** `server/queries/access.ts`, `server/lib/forms/answers.ts`,
`server/lib/forms/submissions.ts`, `server/lib/forms/retention.ts`,
`server/queries/forms.ts`, `server/actions/forms.ts`,
`emails/form-reminder-email.tsx`,
`app/api/internal/shred-form-answers/route.ts`, `vercel.json`,
`tests/forms-answers.test.ts`, `tests/forms-shred.test.ts`.

### 3a. Guards (`server/queries/access.ts`)

1. `requireFormOwnerAccess(ownerType, ownerId?)` — thin alias over
   `requireEventOwnerAccess` (same table, same org setting). Do not copy the
   body; call it.
2. `requireFormManagementAccess(formId, { write })` — loads the form
   (org-filtered, not soft-deleted); templates: `write` → org admin, read →
   `requireAdminAccess`; otherwise delegate to `requireFormOwnerAccess`.
   Returns `{ context, form }`.
3. `requireFormAttachAccess(formId, eventId)` — both
   `requireFormManagementAccess` and `requireEventManagementAccess`.

### 3b. Answers (`server/lib/forms/answers.ts`)

- `sealAnswer(question, value)` → `{ value, encryptedValue }` using
  `encryptSecret(JSON.stringify(value))` for special-category questions.
- `readAnswer(question, row, access: FieldViewerAccess | "self")` →
  `{ kind: "value"; value } | { kind: "withheld" } | { kind: "empty" }` —
  reuse `canReadFieldValue` from `server/lib/member-field-visibility.ts`.
- `tests/forms-answers.test.ts` — round-trip and withholding; set
  `APP_ENCRYPTION_KEY` in the test the way the existing crypto tests do
  (`grep -rn encryptSecret tests`).

### 3c. Submissions (`server/lib/forms/submissions.ts`)

`persistSubmission(tx, { form, event, questions, liveFields, identity,
answers, syncFlags, submittedByUserId })`: `canSubmit` → `validateSubmission`
→ upsert `form_submissions` (by `memberId` or lower-cased `guestEmail`) →
delete + insert `form_answers` → `resolveProfileWrites` →
`upsertMemberCustomFieldAnswers` from `server/lib/member-custom-field-values.ts`.
Single entry point for all four submit actions.

### 3d. Queries (`server/queries/forms.ts`)

Everything from the spec's query list, `orgId`-filtered, `deletedAt IS NULL`.
Notes:

- `getFormForFiller` loads the live custom fields for linked questions in one
  query and the member's answer map via `getMemberCustomFieldAnswerMap` for
  pre-fill.
- `listFormPending(formId)` resolves identities from the event
  (`listEligibleMembers` + external audience + guest responses, filtered by
  `onlyRsvpYes`) or from `form_audience` / active members, then subtracts
  submissions. It backs both the pending list and the reminder recipients.
- `getFormAggregates` runs one `GROUP BY question_id, value` for
  `select`/`boolean` and `jsonb_array_elements_text` for `multi_select`;
  special-category questions are excluded in SQL, not in JS.
- `listFormSubmissions` returns cells already passed through `readAnswer`
  with the viewer's access computed once per submission via the member scope
  helpers in `server/lib/member-management-scope.ts`.

### 3e. Actions (`server/actions/forms.ts`)

Pattern: `server/actions/events.ts`. One action per spec entry, all with
`.metadata({ actionName })`. `setFormQuestions` runs in a transaction: diff
incoming ids against existing, update in place, insert new, delete missing;
`validateQuestionLink` for every linked question before any write.
`createForm` with `fromTemplateId` copies questions with fresh ids.
`submitFormWithToken` reuses `findTokenHolder` from
`server/lib/events/tokens.ts`; `submitFormAsGuest` reuses the rate-limit
bucket approach of `respondAsGuestAction`. `sendFormReminderEmails` copies the
dry-run / real-run shape of `sendEventInviteEmailsAction`.

### 3f. Email + cron

1. `emails/form-reminder-email.tsx` — copy `emails/event-invite-email.tsx`;
   props: form title, event summary (optional), deadline, link.
2. `server/lib/forms/retention.ts` — `shredFormAnswers(now)`: copy the batched
   style of `server/lib/events/retention.ts`; also anonymise guest
   submissions on the event guest schedule.
3. `app/api/internal/shred-form-answers/route.ts` — copy
   `shred-event-guests/route.ts`; add to `vercel.json` at `0 6 * * *`.
4. `tests/forms-shred.test.ts` — DB-backed, skip-without-Postgres harness from
   `membership-report-freeze.test.ts`.

**Done when:** tests green; cron route 401s without the secret; a scripted
submit → read → shred cycle works against the local DB.

---

## Phase 4 — Admin UI

**Files:** `app/admin/forms/page.tsx`, `app/admin/forms/[id]/page.tsx`,
`components/app/forms/*`, `components/app/events/event-forms-panel.tsx`,
`lib/i18n/messages.ts`.
**Patterns:** `components/app/events/events-admin.tsx` (table),
`event-wizard/event-wizard-dialog.tsx` (`Stepper` usage),
`member-custom-field-sheet.tsx` + `member-custom-field-constraint-fields.tsx`
(type / options / constraints / privacy inputs),
`event-audience-dialog.tsx`, `event-emails-panel.tsx`.

1. `forms-admin.tsx` — Forms / Templates switch, TanStack table, filters,
   "New form" dialog (`form-create-dialog.tsx`: blank / template picker,
   owner picker from `listManageableOwners`, optional event from
   `listEventsForOwnerPicker`).
2. `form-editor.tsx` — `Stepper` with Questions · Settings · Submissions ·
   Summary · Reminders; step in the URL (`?step=`) like the event detail
   tabs.
3. `form-builder.tsx` + `form-question-card.tsx` — TanStack Form over the
   whole question list; up / down buttons; add input / add section; profile
   link combobox (loads active fields via a small action); privacy section
   with the special-category coupling (TTL forced, link disabled, reason
   shown); unsaved-changes guard (`beforeunload` + in-app nav prompt as the
   wizard does).
4. `form-settings-panel.tsx` — settings form, status buttons, Save as
   template / Duplicate / Delete; `form-audience-editor.tsx` extends
   `event-audience-dialog.tsx` with the scope toggle (extract the shared
   picker if the dialog cannot take a prop cleanly).
5. `form-submissions-table.tsx` — dynamic columns from questions; lock badge
   for withheld; sensitive toggle; Edit / Delete; "Add submission" sheet
   hosting `form-filler.tsx` (built here, reused in phases 5–6) in proxy
   mode; CSV export via a route handler
   `app/admin/forms/[id]/export/route.ts` (pattern: existing member export).
6. `form-summary.tsx` — aggregate cards; `form-reminders-panel.tsx` — copy
   `event-emails-panel.tsx`.
7. `event-forms-panel.tsx` as a new tab on the event detail (`Tabs` there is
   unchanged); attach / detach dialogs.
8. i18n: `forms` namespace, EN and CS.

**Done when:** an org admin can build a form with a linked question and a
sensitive question, attach it to an event, open it, add a proxy submission,
see the summary, and export CSV with `pnpm dev`.

---

## Phase 5 — Portal UI

**Files:** `app/portal/forms/page.tsx`, `app/portal/forms/[id]/page.tsx`,
`components/app/forms/portal-forms-list.tsx`, changes to
`components/app/events/portal-event-detail.tsx`, `portal-events-agenda.tsx`
and the portal home.

1. List page from `listFormsForViewer`; pending / submitted cards.
2. Filler page: `form-filler.tsx` in member mode — pre-fill, sync checkboxes,
   sensitive note, edit-existing; closed reason from `isFormOpen`.
3. Event page: forms block from `listFormsForEvent`; `inline_after_rsvp`
   placement renders the filler under the RSVP control once answered.
4. Pending badges on agenda cards and portal home.

**Done when:** a member sees a required form as pending, submits with "save
to profile" ticked, and the value appears on their profile.

---

## Phase 6 — Public and token pages

**Files:** `app/events/[slug]/forms/[formId]/page.tsx`,
`app/events/rsvp/[token]/forms/[formId]/page.tsx`, changes to
`public-event-card.tsx` and `token-event-rsvp.tsx`.

1. Guest page: `PublicShell`, `form-filler.tsx` in guest mode (name + email
   fields prepended) → `submitFormAsGuest`.
2. Token page: identity from `findTokenHolder`; logged-in holder → redirect
   to the portal form page; otherwise filler in token mode →
   `submitFormWithToken`.
3. List open forms on both event pages.

**Done when:** an incognito browser can fill a form on a public event and via
a token link; a form on a draft event 404s.

---

## Phase 7 — Seed, docs, hand-off

1. `server/lib/events/seed.ts` (or a sibling `server/lib/forms/seed.ts`): one
   template, one linked required form with a linked question and a
   special-category question, a couple of submissions.
2. `docs/PRD.md` §5.6: replace the two bullets with a pointer to the spec.
3. Deploy docs: new cron path.
4. Linear: file the follow-ups from the spec.
5. Final `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

---

## Order and dependencies

```
1 schema ─▶ 2 pure ─▶ 3 server ─▶ 4 admin (form-filler.tsx) ─▶ 5 portal ─▶ 6 public ─▶ 7
```

Phases 5 and 6 can be built in either order once phase 4 has produced
`form-filler.tsx`.
