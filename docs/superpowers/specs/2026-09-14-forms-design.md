# Forms

**Date:** 2026-09-14
**Status:** approved design, not implemented

## Scope

Second of the three event-related projects (see
`2026-09-13-events-core-design.md`). It delivers a form builder whose forms can
be linked to an event or stand alone, filled by members, external invitees and
anonymous guests, optionally written back into member custom fields, and
carrying the encrypted-answer / TTL / access-control model for sensitive
logistics data from PRD §6.

Deliberately out of v1 (tracked in Linear): conditional questions, file
uploads, profile-sync of special-category answers (needs encrypted custom
field values first), built-in starter templates, forms attached to profiles or
registration, per-answer read audit log (`gdpr-review.md` H6).

## Problem

Camps and trips need more than a yes / no: dietary needs, transport, ID
numbers for a border crossing, an evaluation afterwards. Today that is a Google
Form whose answers sit outside the register, are never deleted, and are
retyped by hand into member profiles. `app/admin/forms` and `app/portal/forms`
are placeholder shells.

## Decisions

- **A form is a standalone entity** with an optional link to one event. An
  event may have many forms. Forms are managed at `/admin/forms` and listed
  on the event's detail page.
- **Forms are separate from the RSVP.** A submission is its own row; the RSVP
  answer is untouched. A form may be restricted to people who answered `yes`.
- **Timing is a placement, not a gate.** A form declares *when* it should be
  filled (after RSVP, before, during, after the event, anytime); that decides
  where and when it is surfaced and nagged for. The only hard cutoffs are the
  form's status and its optional `closesAt`.
- **Templates are a pre-fill.** Creating a form from a template deep-copies
  its questions and settings; the two never touch again. A template is just a
  form with `isTemplate = true`, no event, and organization ownership.
- **Questions reuse the custom-field type system** (`member_custom_field_type`,
  `options`, `constraints`, the widgets and `normalizeFieldInputValue`). A
  question may be linked to a member custom field, in which case it inherits
  the field's type, options and constraints, is pre-filled from the member's
  profile, and can write back to it.
- **Sensitive answers are encrypted at rest and always expire.** A
  `special_category` question must carry a TTL, cannot be linked to a profile
  field, and its answers are sealed with `lib/crypto.ts`. Data the organization
  no longer holds is data it no longer has to protect.
- **Same owner model as events** for who manages a form; templates are
  org-wide (readable by every manager, editable by org admins).
- **Managers may submit on behalf of someone**, recorded as such.

## Data model

All tables carry `orgId` and are filtered by it in every query. Migrations
generated from `server/db/schema.ts`.

### Enums

| Enum | Values |
| --- | --- |
| `form_timing` | `after_rsvp` · `before_event` · `during_event` · `after_event` · `anytime` |
| `form_status` | `draft` · `open` · `closed` |
| `form_visibility` | `org` · `targeted` |
| `form_question_kind` | `input` · `section` |
| `form_profile_sync` | `none` · `offer` · `offer_checked` · `always` |
| `form_audience_kind` | `group` · `category` · `member` |
| `form_audience_scope` | `members` · `admins` |

Reused: `event_owner_type`, `member_custom_field_type`,
`member_custom_field_sensitivity`, `member_custom_field_art9_condition`,
`member_custom_field_visibility`. `email_kind` gains `form_reminder`.

### `forms`

| Column | Notes |
| --- | --- |
| `id` uuid pk | |
| `orgId` | fk organizations, cascade |
| `title` text | |
| `description` text | nullable, plain text shown above the questions |
| `isTemplate` boolean | default false |
| `ownerType` / `ownerCategoryId` / `ownerGroupId` | same enum and CHECK as `events`; CHECK `isTemplate = false OR ownerType = 'organization'` |
| `eventId` | nullable fk events, set null; CHECK `isTemplate = false OR eventId IS NULL` |
| `timing` `form_timing` | default `anytime` |
| `required` boolean | default false; drives pending badges and the reminder list |
| `onlyRsvpYes` boolean | default false; meaningful only when `eventId` is set |
| `closesAt` timestamptz | nullable |
| `visibility` `form_visibility` | default `org`; read only when `eventId IS NULL` |
| `status` `form_status` | default `draft` |
| `createdByUserId` | fk users, set null |
| timestamps + `deletedAt` | soft delete |

Indexes: `(orgId, eventId)`, `(orgId, isTemplate)`, `(orgId, status)`,
`(orgId, ownerGroupId)`, `(orgId, ownerCategoryId)`.

### `form_questions`

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `formId` | fk forms, cascade |
| `sortOrder` integer | CHECK `>= 0` |
| `kind` `form_question_kind` | |
| `label` text | question label or section heading |
| `descriptionHtml` text | nullable; sanitized Tiptap output (sections use it for instructions, inputs for help text) |
| `type` `member_custom_field_type` | nullable; CHECK `kind = 'section' OR type IS NOT NULL` |
| `options` jsonb `string[]` | default `[]` |
| `constraints` jsonb | default `{}`, same shape and `pickConstraintsForType` as custom fields |
| `required` boolean | default false |
| `memberFieldId` | nullable fk member_custom_fields, set null |
| `profileSync` `form_profile_sync` | default `none`; CHECK `profileSync = 'none' OR memberFieldId IS NOT NULL` |
| `sensitivity` | default `normal` |
| `art9Condition`, `processingPurpose` | CHECK as on `member_custom_fields` |
| `valueVisibility` | default `member_managers` |
| `shredAfterEventDays` integer | nullable; CHECK `IS NULL OR > 0` |

CHECK `sensitivity = 'normal' OR (memberFieldId IS NULL AND shredAfterEventDays IS NOT NULL)`.

Index `(formId, sortOrder)`, `(orgId, memberFieldId)`.

For a linked question `type`, `options` and `constraints` are a copy taken
from the custom field when the question is saved. The server re-reads the live
custom field on render and on submit, so the form always matches the profile
schema; the copy only keeps the question meaningful if the field is later
deleted (`memberFieldId` becomes null, the question keeps working unlinked).

### `form_audience`

Only read when `eventId IS NULL AND visibility = 'targeted'`; rows are kept
otherwise so toggling does not lose the list.

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `formId` | cascade |
| `kind` `form_audience_kind` | |
| `groupId` / `categoryId` / `memberId` | CHECK exactly the one matching `kind` |
| `scope` `form_audience_scope` | default `members`; `admins` = group admins of the group / category admins of the category; ignored for `member` |

One partial unique index per kind on `(formId, kind, <id>, scope)`.

### `form_submissions`

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `formId` | cascade |
| `memberId` | fk tenant_members, cascade; nullable |
| `guestEmail`, `guestName` | nullable; CHECK exactly one of `memberId` / `guestEmail` |
| `submittedAt`, `updatedAt` | |
| `submittedByUserId` | fk users, set null; set when a manager submits or edits on someone's behalf, null when the person did it themselves |
| `shreddedAt` timestamptz | nullable; set when every shreddable answer has been nulled |

Unique `(formId, memberId)` and `(formId, lower(guestEmail))` (partial).
Index `(orgId, memberId)`.

### `form_answers`

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `submissionId` | cascade |
| `questionId` | fk form_questions, cascade |
| `value` jsonb `CustomFieldValue` | nullable; plaintext for `normal` questions |
| `encryptedValue` text | nullable; `lib/crypto.ts` envelope of the JSON value for `special_category` questions |

CHECK `value IS NULL OR encryptedValue IS NULL`. Unique `(submissionId, questionId)`.
Index `(orgId, questionId)` for aggregates and shredding.

## Access

### Managing a form

"Manage" = edit settings, questions and audience, open / close, delete,
attach to or detach from an event, see submissions and aggregates, submit on
someone's behalf, send reminders.

Same table as events, keyed on the form's owner:

| Owner | Who may manage |
| --- | --- |
| `group` | group admins of that group, category admins of its category, org admins |
| `category` | category admins of that category, org admins |
| `organization` | per `organizations.orgEventCreators` |

Templates: every manager may read and copy them; only org admins may edit or
delete them. Any manager may "Save as template" (the copy becomes org-owned).

Linking a form to an event requires management access to both; changing a
form's owner requires access to the old and the new owner.

New guards in `server/queries/access.ts`: `requireFormManagementAccess(formId)`
(dispatching like `requireEventManagementAccess`, with the template rule) and
`requireFormOwnerAccess(ownerType, ownerId)` for creation.

### Filling a form

| Form | Who may submit |
| --- | --- |
| linked to an event | anyone who may view and RSVP to the event through the same channel (portal member, token holder, anonymous guest on a public event); if `onlyRsvpYes`, additionally their RSVP answer is `yes` |
| unlinked, `visibility = org` | any member with an active membership, in the portal |
| unlinked, `visibility = targeted` | members eligible under `form_audience`, in the portal |

Unlinked forms have no token or anonymous channel: there is no event to hang a
token on.

Reading answers follows the question's `valueVisibility` exactly as custom
fields do: a manager below the rung is told the answer exists and is withheld,
never shown an empty cell. The submitter always sees their own answers.

## Rules

Pure module `lib/forms/rules.ts`, no DB access, unit tested.

- **Form is open** when `status = open`, `now ≤ closesAt` if set, and the
  linked event (if any) is neither soft-deleted nor `cancelled`. Otherwise
  `FORM_CLOSED`. A form on a `draft` event is unreachable because the event
  page is.
- **Can submit** = open ∧ eligible per the table above. Errors `NOT_ELIGIBLE`,
  `RSVP_REQUIRED`.
- **Placement** (`getFormPlacement(form, event, now)`): `after_rsvp` → shown
  inline once the viewer has answered the RSVP and as a pending card;
  `before_event` → pending card until `startsAt`; `during_event` → pending card
  from `startsAt`; `after_event` → pending card once `endsAt ?? startsAt` has
  passed; `anytime` → always a card. Forms with no event dates behave as
  `anytime`. Placement never blocks submission; an open form is submittable
  from any entry point that lists it.
- **Pending** = `required` ∧ open ∧ can submit ∧ no submission by this
  identity. Drives portal badges, the manager's pending list and reminders.
- **Validation** (`validateSubmission(questions, liveFields, answers)`):
  sections skipped; each input normalized with `normalizeFieldInputValue`
  against its type and `constraints` (a linked question uses the live custom
  field's); `required` enforced; unknown question ids rejected. Returns
  per-question messages → `INVALID_ANSWERS`.
- **Profile sync** (`resolveProfileWrites(questions, answers, syncFlags,
  identity)`): only for member identities. `always` → write; `offer` /
  `offer_checked` → write iff `syncFlags[questionId]` is true; `none` → never.
  Writes are applied through the existing custom-field upsert path so the
  field's constraints apply again. Linking is refused at save time
  (`QUESTION_LINK_INVALID`) for special-category questions, for fields with
  `stage = admin_only`, and for inactive fields.
- **Encryption**: `sealAnswer(question, value)` / `readAnswer(question, row,
  viewerRung)` in `lib/forms/answers.ts`. Special-category values are sealed
  with `encrypt()` into `encryptedValue`; everything else is plaintext so
  aggregates and exports stay queryable. `readAnswer` returns `{ kind:
  "withheld" }` when the viewer is below `valueVisibility`.
- **Shredding**: a question with `shredAfterEventDays = N` has its answers
  nulled once `anchor + N days < now`, where anchor = the event's `endsAt ??
  startsAt`, or for unlinked forms `closesAt`. A question with no anchor
  (unlinked form without `closesAt`, or event without dates) is not shredded
  and the editor shows a warning on it.

## Server modules

### `lib/forms/schemas.ts`

Zod: `formSettingsSchema`, `formQuestionSchema` (discriminated on `kind`),
`setFormQuestionsSchema`, `formAudienceRuleSchema`, `submitFormSchema`
(`{ formId, answers: Record<questionId, unknown>, syncToProfile:
Record<questionId, boolean> }`), token / guest / proxy variants,
`sendFormReminderEmailsSchema`.

### `server/actions/forms.ts`

Management, all `authActionClient` + `requireFormManagementAccess` /
`requireFormOwnerAccess`, `.metadata({ actionName })`:

- `createForm` — `{ settings, fromTemplateId?, eventId? }`; a template id
  deep-copies questions and settings (not audience, not status).
- `updateFormSettings`, `deleteForm` (soft), `setFormStatus`,
  `attachFormToEvent` / `detachFormFromEvent`, `saveAsTemplate` (org-owned
  copy, `isTemplate = true`).
- `setFormQuestions` — replaces the full ordered list in one transaction;
  existing ids are updated in place so answers survive edits; removed ids
  cascade their answers; validates links and privacy CHECKs before writing.
- `setFormAudience` — replaces the rule list.
- `submitFormForMember` — `{ formId, memberId | guestEmail+guestName,
  answers }`; upserts with `submittedByUserId`. `deleteSubmission`.
- `sendFormReminderEmails` — `{ formId, dryRun }`; recipients = pending
  people; kind `form_reminder`; `email_activities.eventId` set when linked.

Filling:

- `submitForm` — portal, `authActionClient` + `requireCurrentMember`.
- `submitFormWithToken` — base `actionClient`; `{ token, formId, answers }`;
  identity from `event_rsvp_tokens`, token valid per the events rule.
- `submitFormAsGuest` — base `actionClient`; public events only; `{ eventSlug,
  formId, name, email, answers }`; rate-limited per IP and per form through
  `rateLimitBuckets`; upserts by email.

All four funnel into `persistSubmission(tx, form, identity, answers,
syncFlags, submittedByUserId)`: validate → upsert submission → replace answers
(sealing special-category ones) → apply profile writes.

### `server/queries/forms.ts`

- `listFormsForManager(ctx, { templates })` — table rows with submission and
  pending counts, limited to manageable forms (templates: all).
- `getFormForEditor(formId)` — settings, questions with the live linked field
  attached, audience rules.
- `listFormsForEvent(eventId, viewer)` — for the event detail tab and the
  portal / public event pages, with placement and the viewer's submission
  state.
- `getFormForFiller(formId, identity)` — questions (live-resolved), the
  identity's existing submission decrypted, and pre-fill values from the
  member's profile for linked questions without a submission.
- `listFormSubmissions(formId, viewer)` — rows with per-cell `readAnswer`.
- `getFormAggregates(formId)` — option counts for `select`, `multi_select`,
  `boolean` input questions; excludes special-category questions.
- `listFormPending(formId)` — eligible identities without a submission, backing
  both the pending list and the reminder recipients.
- `listFormsForViewer(ctx)` — portal: pending and submitted buckets.
- `exportFormSubmissionsCsv(formId, viewer)` — withheld cells export as
  `[withheld]`, never blank.

### `lib/events/eligibility.ts`

`scope: "members" | "admins"` added to group and category rules (default
`members`, so event behaviour is unchanged); `listEligibleMembers` /
`isMemberEligible` shared by both modules.

### Retention cron

`app/api/internal/shred-form-answers/route.ts`, `authorizeCronRequest`,
daily:

1. Null `value` and `encryptedValue` for every answer whose question's TTL has
   passed per the shredding rule; set `form_submissions.shreddedAt` when a
   submission has no remaining answer to a shreddable question.
2. Anonymise guest submissions (null `guestEmail`, `guestName`) on the same
   schedule as `shred-event-guests` (`eventGuestRetentionDays` after the
   event; unlinked forms have no guests).

Member submissions are kept as history and cascade on member erasure.

## UI

The tabbed editors use the `Stepper` primitive from `components/ui/stepper.tsx`
(as the event wizard does), not `Tabs`.

### Admin — `/admin/forms`

- Two views, **Forms** and **Templates**, each a TanStack table: title, event
  (forms only), owner, timing, status, submissions / pending, closes at.
  Filters: status, owner, event. "New form" dialog: blank or from a template,
  owner picker limited to owners the viewer may manage, optional event.
- **Editor `/admin/forms/[id]`**, stepper with:
  - **Questions** — ordered list of cards (input or section), up / down
    reorder buttons, add input / add section. An input card: label, help
    text, type + options + constraints (reusing
    `member-custom-field-constraint-fields.tsx`), required, **Profile link**
    combobox over active non-`admin_only` custom fields (locks type / options
    / constraints, shows the sync-mode select), **Privacy** section:
    sensitivity → Art. 9 condition + purpose, value visibility, "Delete
    answers N days after the event" (forced on and the profile link disabled
    when special-category, with the reason shown). Saved as a whole through
    `setFormQuestions`; unsaved-changes guard.
  - **Settings** — title, description, timing, required, only-RSVP-yes
    (linked only), closes at, visibility + audience editor (unlinked only,
    reusing `event-audience-dialog.tsx` with the members / admins scope
    toggle), status actions (Open / Close), Save as template, Duplicate,
    Delete.
  - **Submissions** — table: name, email, submitted at, one column per input
    question; withheld cells render a lock badge; special-category columns
    hidden behind a "Show sensitive answers" toggle; row actions Edit /
    Delete; "Add submission" (member search or guest email) opens the filler
    in a sheet; CSV export.
  - **Summary** — aggregate cards per eligible question; header stats
    (submissions, pending, shredded).
  - **Reminders** — pending list with "Copy emails", "Send reminder" dialog
    (dry-run count → confirm), send log from `email_activities`.
- **Event detail** gains a **Forms** tab (its existing `Tabs`): the event's forms with status and
  pending counts, "Attach form" (from template / blank / existing unlinked
  form the viewer manages) and "Detach". The event wizard is unchanged.

### Portal

- `/portal/forms`: **Pending** and **Submitted** sections; cards show form,
  event, timing, deadline.
- `/portal/forms/[id]`: the filler. Editing an existing submission reuses the
  page while the form is open.
- Event page: `after_rsvp` forms appear inline under the RSVP control once
  answered; all open forms are listed in a "Forms" block; pending forms also
  surface as cards on `/portal/events` and the portal home.

### Public and token

`/events/[slug]/forms/[formId]` (guest: name + email + answers) and
`/events/rsvp/[token]/forms/[formId]` (identity from the token). The public
and token event pages list the event's open forms.

### Shared

- `components/app/forms/form-filler.tsx` — TanStack Form; one widget per input
  question via `member-custom-field-input.tsx`; sections as headings with
  rich text; linked questions pre-filled with the "Also save this to my
  profile" checkbox for `offer` / `offer_checked` (member identity only);
  special-category questions carry an "encrypted, deleted N days after the
  event" note.
- `components/app/forms/form-builder.tsx`, `form-question-card.tsx`,
  `form-submissions-table.tsx`, `form-summary.tsx`, `form-audience-editor.tsx`.
- `emails/form-reminder-email.tsx` — form title, event, deadline, link.
- All strings in `lib/i18n/messages.ts`, EN and CS.

## Error handling

Typed errors through the safe-action clients and toasts: `FORM_CLOSED`,
`NOT_ELIGIBLE`, `RSVP_REQUIRED`, `TOKEN_INVALID`, `RATE_LIMITED`,
`INVALID_ANSWERS` (carries per-question messages), `QUESTION_LINK_INVALID`,
`TEMPLATE_READ_ONLY`, `FORM_NOT_MANAGEABLE` (attach/detach without access to
both sides). Reminder sends reuse `email_activities` delivery tracking; a
partial failure is reported per recipient, not rolled back.

## Testing

- `tests/forms-rules.test.ts` — open / closed matrix over status, `closesAt`,
  event state; placement per timing with and without event dates; pending
  computation; `onlyRsvpYes`.
- `tests/forms-validation.test.ts` — every type incl. constraints, sections
  skipped, required, unknown ids, linked question validated against the live
  field.
- `tests/forms-profile-sync.test.ts` — the four sync modes, guest identity
  never writes, link refusal cases.
- `tests/forms-answers.test.ts` — seal / read round-trip, withholding by
  rung, plaintext for normal questions.
- `tests/forms-shred.test.ts` — DB-backed, skips without Postgres: answers past
  TTL nulled, others untouched, `shreddedAt` set, unanchored questions left
  alone.
- `tests/events-eligibility.test.ts` — extended with the `admins` scope.

## Follow-ups (Linear)

- Conditional question visibility.
- File-upload questions (needs storage).
- Encrypt special-category custom field values, then allow profile sync for
  special-category questions.
- Built-in starter templates ("Camp registration", "Event evaluation").
- Forms attached to profiles / registration (PRD §5.3).
- Read audit log for sensitive answers (`gdpr-review.md` H6).
