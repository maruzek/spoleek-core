# Forms — live user test before production

**Feature:** Forms (spec `docs/superpowers/specs/2026-09-14-forms-design.md`, branch `froms-base`).
**Date written:** 2026-09-16.
**Goal:** prove, with real people in real roles, that every path a form can be reached through
works, that the access and privacy rules hold, and that nothing sensitive leaks or outlives its
purpose. Automated tests cover the rules and the DB cycle (`tests/forms-*.test.ts`); this
document covers what only a person in front of the app can check.

Mark each item ✅ / ❌ / ⚠️ and note the account used. Anything ❌ in sections 6–8 blocks release.

---

## 0. Set-up

**People needed (four browsers / profiles):**

| Role | Account | Why |
| --- | --- | --- |
| Org admin | `org_admin` member | Templates, sensitive answers, everything |
| Group admin | `group_admin` of one group, not org admin | Scoped manager: owner rules, withheld answers |
| Plain member | active member in that group, with a linked user | Portal filling, profile sync, pending badges |
| Outsider | no account; an incognito window + a real mailbox you can read | Guest and token links |

**Data needed:**

- At least one active, member-facing (`stage ≠ admin_only`) custom field of type `phone` or `text`
  (e.g. "Phone"), and one `select` field with options.
- A published **public** event with dates in the future and `maxGuestsPerResponse ≥ 1`.
- A published **targeted** event owned by the group admin's group, audience = that group, with an
  external invitee added by email (the outsider's mailbox).
- A published event whose `endsAt` is in the **past** (for the TTL check).
- Resend configured so reminder emails actually arrive.
- Optional fast path: `pnpm db:seed:forms` creates a template and a linked registration form with
  two submissions on the demo camp; `--reset` removes them.

**How it is implemented (what to expect):**

- Admin UI is English only; portal, public and token pages follow the org locale (EN/CS).
- Every write goes through one path (`persistSubmission`): validate → upsert one submission per
  member or per lower-cased guest email → replace answers → write profile values inside the same
  transaction.
- Special-category answers are stored only encrypted; `readAnswer` withholds before decrypting.
- Shredding runs daily at 06:00 via `/api/internal/shred-form-answers` (`PURGE_CRON_SECRET`).

---

## 1. Admin — creating and building (org admin, then group admin)

### 1.1 List and create
- [ ] `/admin/forms` shows **Forms** and **Templates** toggles with counts; status and owner filters work; search matches title, event and owner.
- [ ] "New form" → blank → title, owner, no event → lands on the editor as **Draft**.
- [ ] "New form" → from template (after 1.4) → questions are copied; editing the copy does not touch the template and vice versa.
- [ ] "New template" is visible to the org admin only; the group admin sees templates but no "New template" button and cannot edit one (Questions/Settings read-only, no Delete).
- [ ] Group admin's "New form" owner picker lists only **Whole organization** (if `orgEventCreators` allows) / their category / their group.

### 1.2 Questions tab (builder)
- [ ] Add question, add section, move up/down, remove; save; reload → order kept.
- [ ] Editing the label of a question that already has answers keeps the answers (same row id).
- [ ] Removing a question that has answers → confirm the answers are gone from the Submissions tab after save.
- [ ] Help text / section instructions: rich text (headings, bold, list, link) survives save and renders on the filler.
- [ ] Type switch to select without options → save blocked with "Add at least one option".
- [ ] Validation block (min/max, length, date bounds) appears only for types that support it and is enforced on the filler.
- [ ] **Profile link**: combobox lists only active, member-facing, `normal` fields. Linking locks type/options/validation and shows "Type, options and validation come from the profile field …"; "Write back" select appears (default *ticked*).
- [ ] Unlinking restores the type select; write-back resets to *Never*.
- [ ] **Sensitive** toggle: Art. 9 condition + purpose become required (save blocked without them); profile link is disabled with the reason; "Delete answers after" is forced (defaults to 30, cannot be cleared); visibility flips to *Org admins only*.
- [ ] TTL on a **standalone** form with no deadline → amber "nothing to count from" warning under the field.
- [ ] Unsaved changes: sticky bar; switching tab prompts "Leave without saving?"; reloading the tab prompts the browser dialog.
- [ ] Link error from the server: link a field, then have another admin set that field to *Admin only* / inactive, save → the card shows the reason under **Profile link**, nothing is written.

### 1.3 Settings tab
- [ ] Title, description, timing, closes-at, required, only-RSVP-yes (linked only), visibility + audience (standalone only) save and reload correctly.
- [ ] Owner change to an owner the viewer cannot manage is refused (group admin tries to move a form to another group → error toast, nothing changes).
- [ ] Timing list is limited to *Anytime* for a standalone form.
- [ ] Audience editor (standalone, targeted): add category / group / member; the chip toggle "everyone ↔ admins only" on group and category chips; eligible count updates after save. Adding the same group twice with different scopes is allowed and counts correctly (admins ⊂ everyone).
- [ ] Detach from event → form becomes standalone, timing stays, only-RSVP-yes resets, submissions kept.
- [ ] Save as template → new org-owned template with copied questions; Duplicate → "(copy)" draft with the same owner and event.
- [ ] Delete → form disappears from every list, including the portal; deep link to `/admin/forms/<id>` is a 403/404, not a crash.

### 1.4 Open / close
- [ ] "Open form" is disabled with zero input questions.
- [ ] Open → portal members see it (2.x); Close → portal hides it from *To fill in*, keeps it under *Submitted* for those who answered, filler shows "This form is closed".
- [ ] Template header shows no Open/Close and no stats strip.

---

## 2. Portal — filling (plain member)

### 2.1 List and badges
- [ ] `/portal/forms` shows a required open form under **To fill in** with the *Required* badge and deadline; optional forms show *Optional*.
- [ ] Portal home shows the amber "Forms to fill in" alert with the right count; disappears after submitting.
- [ ] `/portal/events` card carries "N forms to fill in" only for events with a pending **required** form.
- [ ] A form on a **targeted** standalone form the member is not in the audience of is neither listed nor reachable by URL (404).
- [ ] A form on a **draft** event is not reachable by URL (404) even when the form itself is open.

### 2.2 Filler
- [ ] Linked question is **pre-filled** from the profile; "Also save this to my profile" is ticked by default for *Offer (ticked)*, unticked for *Offer*, absent for *Never*, and shows "Saved to your profile as well" for *Always*.
- [ ] Submit with sync ticked → profile field updated (check `/portal/profile` and the admin member record). Submit with it unticked → profile unchanged.
- [ ] Submit with an **empty** linked answer and sync ticked → profile value is **not** cleared.
- [ ] Required question empty → per-question error under the widget (server message), nothing saved.
- [ ] Select value typed via devtools that is not an option → rejected ("must be one of the listed options").
- [ ] Sensitive question shows "Stored encrypted · deleted N days after the event/deadline".
- [ ] Re-open a submitted form → "You submitted this on …", answers pre-filled, **Save changes** updates in place (one row in the Submissions tab, updated timestamp).
- [ ] Only-RSVP-yes form, member answered *maybe* → amber "Answer the invitation with a yes first"; after switching to *yes* the form becomes submittable.
- [ ] Deadline passed (set closes-at in the past) → "The deadline for this form has passed", inputs disabled, previous answers still visible.
- [ ] Switch the org locale to CS → all portal form copy is Czech (badges, notices, buttons, validation messages).

### 2.3 Event page and the after-RSVP dialog
- [ ] Event page lists open forms **above** the description with pending hint.
- [ ] Event with a **required** `after_rsvp` form: answer the RSVP → dialog opens after the refresh; no close button; Escape and outside click do nothing; submit → dialog closes, form moves to *Submitted*.
- [ ] Reload the event page before submitting → dialog opens again on load.
- [ ] **Optional** `after_rsvp` form: dialog has "Later" and a close button; "Later" dismisses; it does **not** reopen on reload.
- [ ] `after_rsvp` + only-RSVP-yes, answer *no* → no dialog; the card on the page shows the "answer yes first" state when opened.
- [ ] `before_event` / `after_event` timing: check the form is listed but not badged as pending outside its window (before-event form on an event that already started is *listed*, not nagged — by design; confirm it still can be submitted).

---

## 3. Public and token (outsider, incognito)

### 3.1 Public event
- [ ] `/events/<slug>` on a public event lists open forms above the description; a **non-public** event's form URL (`/events/<slug>/forms/<id>`) is a 404.
- [ ] Open a form from the list → guest filler with **Your name / Your email** first; submit → "Thank you — your answers are saved".
- [ ] Submit again with the **same email** (different case) → still one row in the admin Submissions tab, answers replaced.
- [ ] Only-RSVP-yes form, email that has not RSVP'd yes → "Answer the invitation with a yes first" toast, nothing saved.
- [ ] Rate limit: 11 quick guest submissions from one browser within an hour → "Too many attempts".
- [ ] RSVP as a guest on an event with an `after_rsvp` form → success card shows the amber "One more thing" block with **Fill in: <form>** → lands on the token filler with no name/email fields.
- [ ] Draft form on the public event is not listed and its URL 404s.

### 3.2 Token link
- [ ] Reminder email (4.2) to the external invitee → link `/events/rsvp/<token>/forms/<id>` opens the filler with "Filling in as <name/email>", no name/email fields.
- [ ] Submit, reopen the link → answers pre-filled, editable.
- [ ] Token event page (`/events/rsvp/<token>`) lists the open forms; RSVP there → required `after_rsvp` dialog behaves as in 2.3.
- [ ] Member's own token link while **signed in** → redirected to `/portal/forms/<id>`.
- [ ] Token for a **different** event's form → 404. Deleted/replaced token → "This link is no longer valid" card, not a crash.
- [ ] Form deadline passed but event still live → closed notice on the token filler; RSVP deadline passed but form open → form still submittable (the two deadlines are independent).

---

## 4. Admin — submissions, summary, reminders, export

### 4.1 Submissions tab
- [ ] One column per input question in question order; sections are not columns.
- [ ] Sensitive columns hidden behind **Show sensitive**; header shows a lock icon when shown.
- [ ] **Group admin** viewing a form with an *Org admins only* question → cell shows the **Withheld** lock badge (never blank) for answered rows and "—" for unanswered; org admin sees the value.
- [ ] Guest rows show the *Guest* badge; rows entered by a manager show the pen icon.
- [ ] **Add submission** → member picker (search by name/email) → filler → save → row appears with the pen icon; "Add submission" with the same member again replaces the row.
- [ ] Add submission for a **guest by email** is offered only on linked forms; standalone forms show member picker only.
- [ ] Add submission on a **closed** form works (manager proxy skips deadline/eligibility by design).
- [ ] Edit → filler pre-filled; withheld cells for a scoped manager show the amber note and are kept as-is when saved untouched.
- [ ] Delete submission → row gone; the person can submit again while open.
- [ ] Pending count in the header stats and the list matches the Reminders list.

### 4.2 Reminders tab
- [ ] Optional form → "nobody counts as pending" note; required draft/closed form → status note; open required form → list.
- [ ] Pending list = eligible people minus submitters; only-RSVP-yes narrows it to *yes* answers; external invitees and public-page guests (by email) appear for linked forms; members without any email are listed with *No email* and excluded from the count.
- [ ] Copy emails → clipboard matches the list.
- [ ] Send reminder → dialog shows the dry-run count → confirm → toast with the sent count; send log rows appear with delivery status (wait for Resend webhook → *delivered*).
- [ ] Emails: member gets a **portal** link and the "sign in" footer; external gets a **token** link and the "personal link" footer; subject/heading/body in the org locale; event block shown only for linked forms; deadline line only when closes-at is set.
- [ ] Send with the form **closed** → button disabled.

### 4.3 Summary tab
- [ ] Cards for select / multi-select / boolean questions only; free-text and sensitive questions are absent; "N / total answered" and bars match the table.
- [ ] Options with zero answers are listed with 0 (not dropped).

### 4.4 CSV export
- [ ] Download opens as `<slug>-submissions.csv`, UTF-8 with BOM (Czech characters correct in Excel).
- [ ] Columns: Name, Email, Submitted at, then one per input question; withheld cells read `[withheld]`, empty cells are blank; multi-select joined with `; `.
- [ ] With "Show sensitive" **off**, sensitive columns are absent; with it on (`?sensitive=1`), present — for the group admin they still read `[withheld]` where visibility is org-admins-only.
- [ ] Group admin cannot export a form they do not manage (direct URL → 403).

---

## 5. Event detail — Forms tab (group admin and org admin)

- [ ] Tab shows every form on the event regardless of status, with submitted/pending counts.
- [ ] "New form" preselects the event (no event picker); "Attach existing" lists only the viewer's **standalone** forms; Detach unlinks (form stays).
- [ ] Attach a form the viewer manages to an event they do **not** manage → refused (`FORM_NOT_MANAGEABLE` / 403), nothing changes.
- [ ] Cancel the event → linked forms show "The event was cancelled" on every filler and stop accepting answers; existing answers remain readable.
- [ ] Delete the event → form survives as standalone (`eventId` null), answers kept; the portal list no longer shows the event line on its card.

---

## 6. Access control (blocking)

Run each with the **group admin** and the **plain member** unless stated.

- [ ] Plain member cannot open `/admin/forms` or any `/admin/forms/<id>` (403).
- [ ] Group admin sees only forms whose owner is their group / category / (org-wide only if `orgEventCreators` allows); a direct URL to an org-owned form they may not manage is 403.
- [ ] Group admin can **read** any template and create a form from it, but Questions/Settings are read-only and Save/Delete are absent; `setFormQuestions` on a template via devtools returns `TEMPLATE_READ_ONLY`.
- [ ] Org-admin-only answers are withheld from the group admin in the table, the edit sheet, the CSV and the Summary (summary excludes only sensitive; visibility does not affect counts — confirm counts do **not** leak values by name).
- [ ] Plain member can read **their own** sensitive answers (portal filler) but nobody else's: change the URL to another member's form id → 404 or only their own submission is shown.
- [ ] Member data export (`/admin/members/<id>` → export) includes `formInvitations` and `formSubmissions` with decrypted answers for that member only.
- [ ] Standalone targeted form with an *admins only* category rule: only the category's admins (not the group admins of its groups) can see it in the portal.

---

## 7. Privacy, encryption and retention (blocking)

- [ ] In Adminer, `form_answers` rows for a sensitive question have `value IS NULL` and `encrypted_value` starting with the envelope prefix; a plaintext search for the typed text finds nothing.
- [ ] Attempt to make a sensitive question linked via devtools → `QUESTION_LINK_INVALID:special_category`; DB CHECK also rejects a direct insert.
- [ ] Retention: event ended > N days ago, question TTL = N → call `GET /api/internal/shred-form-answers` with the `PURGE_CRON_SECRET` bearer:
  - [ ] without the secret → 401;
  - [ ] with it → JSON counts; the sensitive/TTL'd answers are null in DB; the filler and table show them as empty (not withheld); untouched questions keep values;
  - [ ] once every shreddable answer of a submission is gone, `shredded_at` is set and the Submissions tab shows the *Shredded* badge and the header stat "N shredded";
  - [ ] second run is a no-op (all counts 0);
  - [ ] guest submissions on events older than `eventGuestRetentionDays` have `guest_email`/`guest_name` nulled; the row and its answers remain.
- [ ] Standalone form with a TTL but **no deadline** → nothing is shredded (editor warned); set a past deadline → next run shreds.
- [ ] Deleting a member (soft delete + purge) removes their form submissions (cascade) — check after the purge cron.

---

## 8. Robustness (blocking)

- [ ] Two browsers submit the same form for the same member/email at once → one row, last write wins, no 500.
- [ ] Custom field **type change** after linking (text → select): filler validates against the live field (the select), the builder shows `type_mismatch` on save until relinked.
- [ ] Custom field **deleted** after linking: question keeps working unlinked with its snapshot; no sync checkbox; builder shows it unlinked.
- [ ] Custom field **deactivated**: builder refuses the link on next save (`field_inactive`); existing filler still works.
- [ ] 200-question form (max) saves and renders; 201 → rejected.
- [ ] Mobile (≈400 px): builder cards, portal filler, dialog and public filler are usable; the after-RSVP dialog scrolls inside itself.
- [ ] Dark mode: amber/pending states, withheld badge and encrypted note are legible.

---

## 9. Known gaps / by design — do not file as bugs

- Admin UI is English only (matches the rest of admin).
- No conditional questions, no file uploads, no starter templates, no profile/registration forms, no read-audit log — MAR-168 … MAR-173.
- A required `after_rsvp` form reopens its dialog on **every** load until answered; optional ones only prompt once after the RSVP.
- Manager proxy submissions bypass deadline, eligibility and only-RSVP-yes on purpose.
- Pending/placement: `before_event` stops nagging at start, `after_event` starts nagging at end, `during_event` nags from start with no end; forms without event dates behave as *Anytime*.
- Token submissions ignore the **RSVP** deadline; only the form's own deadline and the event's existence/draft state gate them.
- Submission-table access is by admin level (org admin / leader = full, group or category admin = scoped); per-member scope is not applied because the visibility rungs only distinguish those two levels.
- `explicit_consent` is allowed as the Art. 9 condition on form questions (unlike custom fields, which restrict it to admin-only stage) — decide before release whether the filler's shown purpose counts as consent.
