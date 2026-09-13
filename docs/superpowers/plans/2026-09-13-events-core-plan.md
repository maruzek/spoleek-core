# Events core — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-13-events-core-design.md`
**Date:** 2026-09-13

Seven phases, each ending in a green `pnpm typecheck && pnpm lint && pnpm test`
and a commit. Phases 1–3 have no UI and are fully testable in isolation; UI
starts in phase 4. Every phase lists the existing code it copies from — read
that file before writing the new one.

Steps marked **[you]** are the ones where the logic embodies a product decision
with more than one valid answer; the scaffold (file, signature, tests) is
prepared first and the body is left for you to write.

---

## Phase 1 — Schema and migration

**Files:** `server/db/schema.ts`, `server/db/migrations/*` (generated).

1. Add enums after `memberPaymentStatusEnum`:
   `eventOwnerTypeEnum`, `eventVisibilityEnum`, `eventStatusEnum`,
   `eventAudienceKindEnum`, `eventRsvpAnswerEnum`, `eventRsvpStandingEnum`,
   `orgEventCreatorsEnum` — values per spec.
2. Add to `organizations`: `orgEventCreators` (default `org_admins`),
   `eventGuestRetentionDays` (default 30, CHECK `> 0`).
3. Add `event_invite` to `emailKindEnum` with a comment in the style of the
   existing entries (explicit-only, never automatic).
4. Add tables `events`, `event_audience`, `event_responses`,
   `event_rsvp_tokens` after `membershipReportMembers`, with the CHECKs,
   partial unique indexes and plain indexes from the spec. Copy the doc-comment
   style from `membershipReports` — one paragraph per table saying *why* the
   shape is what it is (owner ≠ audience; no `expiresAt` on tokens).
5. Add `email_activities.eventId` (fk events, set null, indexed).
6. `pnpm db:generate`, read the SQL, confirm partial unique indexes use
   `lower(guest_email)` / `lower(external_email)`. `pnpm db:migrate` locally.

**Done when:** migration applies on a fresh DB and on the seeded DB; typecheck
green.

---

## Phase 2 — Pure rules module

**Files:** `lib/events/rsvp.ts`, `lib/events/eligibility.ts`,
`tests/events-rsvp.test.ts`, `tests/events-eligibility.test.ts`.
**Pattern:** `lib/membership-period.ts` + `tests/membership-period.test.ts`
(pure module, no DB, exhaustive table tests).

1. `lib/events/rsvp.ts` exports:
   - `isRsvpOpen(event, now): { open: true } | { open: false; reason: "draft" | "cancelled" | "deadline_passed" | "event_over" }`
   - `resolveStanding({ capacity, seatsTaken, guestCount }): "confirmed" | "reserve"` **[you]**
   - `seatsTaken(responses)` — `Σ (1 + guestCount)` over confirmed yes.
   - `isTokenValid({ event, token, now })` — wraps `isRsvpOpen`, adds the
     90-day fallback from `issuedAt` when no dates and no deadline.
   - `canPromote({ capacity, seatsTaken, response })` — used by manual
     promotion; false when it would exceed capacity.
2. `lib/events/eligibility.ts` exports
   `resolveEligibleMemberIds({ rules, groupMemberships, groupsByCategory, activeMemberIds })`
   — pure set algebra over already-loaded rows so it is testable without the
   DB. The query layer (phase 3) loads the rows and calls this. **[you]**
3. Tests first, then bodies. Cases from the spec's Testing section, plus:
   `capacity = null` never yields reserve; `guestCount` raise from confirmed
   past capacity → reserve as a whole; `no`/`maybe` never counts seats.

**Done when:** both test files green; no imports from `server/`.

---

## Phase 3 — Access, queries, actions, cron, email

**Files:** `server/queries/access.ts`, `server/queries/events.ts`,
`server/actions/events.ts`, `server/lib/events/tokens.ts`,
`emails/event-invite-email.tsx`,
`app/api/internal/shred-event-guests/route.ts`, `vercel.json`,
`tests/events-capacity.test.ts`.

### 3a. Guards (`server/queries/access.ts`)

1. `requireEventOwnerAccess(ownerType, ownerId?)`:
   - `group` → `requireGroupManagementAccess(ownerId)`
   - `category` → `requireCategoryManagementAccess(ownerId)`
   - `organization` → read `organizations.orgEventCreators`; `org_admins` →
     `requireOrgAdminAccess`; `category_admins` → org admin OR
     `listScopedCategoryIds(...).length > 0`; `any_admin` → org admin OR any
     scoped category OR any scoped group. Reuse `requireAdminAccess` for the
     base context.
2. `requireEventManagementAccess(eventId)` — loads the event (org-filtered,
   not soft-deleted), then delegates to `requireEventOwnerAccess`. Returns
   `{ context, event }`.
3. `listManageableOwners(context)` — returns `{ organization: boolean,
   categoryIds, groupIds }` for the owner picker and the admin list filter.

### 3b. Tokens (`server/lib/events/tokens.ts`)

Copy the hashing approach from `server/lib/rate-limit.ts` / the activation
token code: `issueRsvpToken({ eventId, orgId, memberId | externalEmail })`
returns the raw token once; `findTokenHolder(rawToken)` returns event +
holder or null. Re-issuing for the same holder replaces the old row (one live
token per holder per event).

### 3c. Queries (`server/queries/events.ts`)

`listEventsForViewer`, `listEventsForManager`, `getEventDetail`,
`listEligibleMembers`, `listEventResponses`, `getEventRecipients`,
`getEventCounts(eventId)` (confirmed seats, reserve count) — all `orgId`
filtered, `deletedAt IS NULL`. `getEventRecipients(eventId, filter)` is the
single source for copy and send; returns `{ email, name, memberId?,
externalEmail? }[]` deduped by lower-cased email. Preferred member email via
the existing `memberPreferredEmail` logic (see `server/queries/members.ts`).

### 3d. Actions (`server/actions/events.ts`)

Pattern: `server/actions/groups.ts` (authActionClient + guard inside
`.action`), `server/actions/join.ts` (unauthenticated `actionClient` +
`consumeRateLimit`), `server/actions/policies.ts` (explicit send with
`sendNotificationEmails`).

1. Zod schemas in `lib/events/schemas.ts` (shared with forms in phase 4):
   `eventInputSchema` (with `.superRefine` for end ≥ start, owner id matches
   owner type), `audienceRuleSchema`, `respondSchema`.
2. Manager actions: `createEvent`, `updateEvent`, `publishEvent`,
   `cancelEvent`, `deleteEvent`, `setEventAudience`, `addExternalInvitees`,
   `setResponseStanding`, `removeResponse`, `sendEventInviteEmails` (with
   `dryRun`).
3. Response actions: `respondToEvent` (member), `respondWithToken`,
   `respondAsGuest`. All three share one internal `upsertResponse(tx, …)`
   that runs `SELECT … FOR UPDATE` on the event row, computes
   `seatsTaken` excluding the responder's own current row, calls
   `resolveStanding`, upserts. Guest path: `consumeRateLimit` scope
   `event_guest_rsvp`, identifiers `ip` (10/h) and `event:${id}` (200/h).
4. Slug: `slugify(title)` + numeric suffix on collision, same helper as
   `saveGroupAction`.
5. Description: run through `server/lib/policy-html.ts` sanitizer on write
   (rename nothing; import the function).

### 3e. Email + cron

1. `emails/event-invite-email.tsx` — copy layout from
   `emails/policy-version-published-email.tsx`; props: event summary, RSVP
   URL, communication link, org name.
2. `app/api/internal/shred-event-guests/route.ts` — copy
   `purge-deleted-members/route.ts` (`authorizeCronRequest`, batched
   updates, log counts). Add to `vercel.json` at `0 5 * * *` and to the
   docker cron docs if any exist (`grep -rn purge-deleted-members docs
   docker*`).

### 3f. DB test

`tests/events-capacity.test.ts` — copy the skip-without-Postgres harness from
`membership-report-freeze.test.ts`; two `Promise.all` calls to
`upsertResponse` for the last seat; assert exactly one `confirmed`.

**Done when:** all tests green; `pnpm lint` clean; the cron route responds
401 without the secret.

---

## Phase 4 — Admin UI

**Files:** `app/admin/events/page.tsx`, `app/admin/events/[id]/page.tsx`,
`components/app/events/*`, `lib/i18n/messages.ts`.
**Patterns:** `components/app/group-categories-admin.tsx` (table + sheet),
`group-sheet.tsx` / `group-form.tsx` (TanStack Form in a sheet),
`policy-editor.tsx` (Tiptap), `policy-publish-dialog.tsx` (confirm-with-count
dialog), `group-detail.tsx` (tabbed detail).

1. `events-admin.tsx` — TanStack table, columns per spec, status/owner
   filters, "New event" opens `event-sheet.tsx`.
2. `event-form.tsx` — fields per spec; owner picker fed by
   `listManageableOwners`; slug field auto-fills from title until manually
   edited (copy the behaviour from `group-form.tsx`); Tiptap via a thin
   `event-description-editor.tsx` that reuses `policy-editor.tsx`'s
   extension set.
3. `event-detail.tsx` — shared read-only rendering (used again in phases 5
   and 6). Props: event, viewer's response, RSVP slot (render prop) so the
   admin overview can pass `null`.
4. Detail page tabs: `event-audience-panel.tsx` (rule editor; member search
   reuses `member-assignment-sheet.tsx`'s picker), `event-responses-panel.tsx`
   (table + "Confirm place"), `event-emails-panel.tsx` (copy buttons per
   filter using `navigator.clipboard`, send dialog with dry-run count, send
   log from `server/queries/email-activity.ts` filtered by `eventId`).
5. Org settings: add the two fields to `membership-settings-card.tsx` or a new
   `events-settings-card.tsx` on `app/admin/settings/page.tsx`; new
   `saveEventSettingsAction` in `server/actions/organization-settings.ts`.
6. Sidebar entry already exists (placeholder route) — replace placeholder.
7. i18n: `events` namespace in both `en` and `cs`.

**Done when:** an org admin can create → target → publish → see responses →
copy emails → send invites end to end with `pnpm dev`.

---

## Phase 5 — Portal UI

**Files:** `app/portal/events/page.tsx`, `app/portal/events/[slug]/page.tsx`,
`components/app/events/event-rsvp-control.tsx`,
`components/app/events/event-list-section.tsx`.

1. List page: three sections from `listEventsForViewer`; card shows date,
   owner name, answer badge.
2. Detail page: `event-detail.tsx` + `event-rsvp-control.tsx` (yes/no/maybe
   segmented control, guest stepper when `maxGuestsPerResponse > 0`,
   standing message, closed-reason message from `isRsvpOpen`). Calls
   `respondToEvent`.

**Done when:** a member in a targeted group sees the event under *Invited*,
answers, changes answer, sees reserve standing when capacity is full.

---

## Phase 6 — Public pages

**Files:** `app/events/[slug]/page.tsx`, `app/events/rsvp/[token]/page.tsx`,
`components/app/events/guest-rsvp-form.tsx`.
**Pattern:** `app/join/page.tsx` + `components/public/public-shell.tsx`.

1. `/events/[slug]` — `PublicShell`, `event-detail.tsx`, `guest-rsvp-form.tsx`
   (name, email, answer, guests) → `respondAsGuest`; confirmation screen
   shows the "change your answer" token link.
2. `/events/rsvp/[token]` — `findTokenHolder`; invalid → plain message page;
   logged-in holder → redirect to portal; otherwise `event-detail.tsx` +
   `event-rsvp-control.tsx` bound to `respondWithToken`.
3. `middleware`/route config: confirm `/events/*` is not behind the
   authenticated layout (check `app/layout.tsx` and any matcher).

**Done when:** an incognito browser can RSVP to a public event and to a
token link; a draft event 404s publicly.

---

## Phase 7 — Seed, docs, hand-off

1. `server/db/seed.ts`: one published org-wide event, one targeted group
   event with capacity 5 and a couple of responses, one draft.
2. `docs/PRD.md` §5.5: replace the three bullets with a pointer to the spec.
3. `README`/deploy docs: new cron path and secret unchanged.
4. Update the Linear follow-ups (MAR-160…164) with any new details learned.
5. Final `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

---

## Order and dependencies

```
1 schema ─▶ 2 pure rules ─▶ 3 server ─▶ 4 admin ─▶ 5 portal ─▶ 6 public ─▶ 7
                                   └────────────▶ (5 and 6 depend on 3 + event-detail from 4)
```

Phases 5 and 6 can be built in either order once phase 4 has produced
`event-detail.tsx`.
