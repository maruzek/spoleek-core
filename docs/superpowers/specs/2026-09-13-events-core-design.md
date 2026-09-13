# Events core

**Date:** 2026-09-13
**Status:** approved design, not implemented

## Scope

This is the first of three event-related projects. It delivers events with a
built-in RSVP. The other two get their own specs later and plug into this one:

1. **Events core** — this document.
2. **Forms** — a form builder attachable to an event (and later to profiles),
   carrying the encrypted-field / TTL / access-control model for sensitive
   logistics data.
3. **Event ticketing** — event-linked payments on top of `member_payments`.

Deliberately out of v1 (tracked in Linear): geocoding and map embed, cover
image, recurring events, editing events in the detail-page layout instead of a
sheet, an access log for who viewed response lists.

## Problem

Youth organizations run camps, meetings and open days for audiences that cut
across their group structure: one troop's camp invites a second troop and two
parents; an open day is for the public. Today `app/admin/events` and
`app/portal/events` are placeholder shells.

## Decisions

- **Owner and audience are separate.** An event is *owned* by the organization,
  a category, or a group; ownership decides who manages it and where it is
  listed. An event is *targeted* at an audience — groups, categories, individual
  members, external emails — which decides who is invited.
- **Audience is rules, not rows.** Eligibility is computed from
  `group_memberships` at read time. There is no invitee snapshot to drift.
- **No automatic email, ever.** Managers copy email lists or explicitly send an
  invite through Resend after a confirmation showing the recipient count.
- **Built-in RSVP:** yes / no / maybe, optional guest count, optional capacity
  with a reserve list, manual promotion from reserve.
- **Tokenized RSVP links** so shadow members, non-activated members and external
  guests can answer without a login. Logged-in members answer in the portal.
- **Public events accept anonymous RSVPs** (name + email).

## Data model

All tables carry `orgId` and are filtered by it in every query. Migrations are
generated from `server/db/schema.ts`.

### `events`

| Column | Notes |
| --- | --- |
| `id` uuid pk | |
| `orgId` | fk organizations, cascade |
| `slug` text | unique per org; derived from `title` with the same helper groups use, editable |
| `title` text | |
| `descriptionHtml` text | sanitized Tiptap output, same editor as `policy-editor.tsx` |
| `ownerType` enum `event_owner_type` | `organization` · `category` · `group` |
| `ownerCategoryId` / `ownerGroupId` | nullable fks; CHECK exactly the one matching `ownerType` is set (`organization` → both null) |
| `visibility` enum `event_visibility` | `public` · `org` · `targeted` |
| `status` enum `event_status` | `draft` · `published` · `cancelled` |
| `startsAt`, `endsAt` timestamptz | both nullable; CHECK `endsAt IS NULL OR (startsAt IS NOT NULL AND endsAt >= startsAt)` |
| `allDay` boolean | default false |
| `rsvpDeadlineAt` timestamptz | nullable; set by the creator ("answer a week before") |
| `capacity` integer | nullable; CHECK `> 0` |
| `maxGuestsPerResponse` integer | not null, default 0; CHECK `>= 0` |
| `locationName`, `locationAddress` text | nullable, free text |
| `communicationLink` text | nullable; WhatsApp / Facebook / etc. |
| `createdByUserId` | fk users, set null |
| timestamps + `deletedAt` | soft delete, same pattern as members |

Indexes: `(orgId, slug)` unique, `(orgId, status, startsAt)`,
`(orgId, ownerGroupId)`, `(orgId, ownerCategoryId)`.

### `event_audience`

Only read when `visibility = 'targeted'`; rows may exist for other visibilities
(kept so switching visibility back and forth does not lose the list).

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `eventId` | fk events, cascade |
| `kind` enum `event_audience_kind` | `group` · `category` · `member` · `external` |
| `groupId` / `categoryId` / `memberId` / `externalEmail` (+ `externalName`) | CHECK exactly the one matching `kind` |

Unique on `(eventId, kind, coalesce(groupId, categoryId, memberId), lower(externalEmail))`
— implemented as one partial unique index per kind.

### `event_responses`

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `eventId` | cascade |
| `memberId` | fk tenant_members, cascade; nullable |
| `guestEmail`, `guestName` | nullable; CHECK exactly one of `memberId` / `guestEmail` |
| `answer` enum `event_rsvp_answer` | `yes` · `no` · `maybe` |
| `guestCount` integer | not null default 0; CHECK `>= 0` (upper bound enforced in the action against `maxGuestsPerResponse`) |
| `standing` enum `event_rsvp_standing` | `confirmed` · `reserve`; meaningful only when `answer = yes`, otherwise `confirmed` |
| `respondedAt`, `updatedAt` | |
| `confirmedByUserId` | fk users, set null; set on manual reserve promotion |

Unique `(eventId, memberId)` and `(eventId, lower(guestEmail))` (partial).

### `event_rsvp_tokens`

| Column | Notes |
| --- | --- |
| `id`, `orgId`, `eventId` | cascade |
| `memberId` / `externalEmail` | CHECK exactly one |
| `tokenHash` text | sha256 of 32 random bytes; unique |
| `issuedAt`, `lastUsedAt` | |

No `expiresAt`. Validity is derived from the live event (see RSVP rules), so
changing event dates never orphans or extends a token by accident.

### Changes to existing tables

- `organizations.orgEventCreators` enum `org_event_creators`:
  `org_admins` (default) · `category_admins` · `any_admin`.
- `organizations.eventGuestRetentionDays` integer, not null, default 30.
- `email_kind` gains `event_invite`.
- `email_activities.eventId` nullable fk events (set null), indexed, so the
  per-event send log and the copy lists agree on who was contacted.

## Access

### Managing an event

"Manage" = create, edit, publish, cancel, delete, edit audience, see responses,
promote from reserve, copy emails, send invites.

| Owner | Who may manage |
| --- | --- |
| `group` | group admins of that group (`group_memberships.role = group_admin`), category admins of its category, org admins |
| `category` | category admins of that category, org admins |
| `organization` | per `organizations.orgEventCreators`: `org_admins` → org admins only; `category_admins` → + every category admin; `any_admin` → + every group admin |

System admins are org admins everywhere, as today.

New guard `requireEventManagementAccess(eventId)` in `server/queries/access.ts`
dispatching to `requireGroupManagementAccess`,
`requireCategoryManagementAccess`, `requireOrgAdminAccess` and the org setting.
For creation, `requireEventOwnerAccess(ownerType, ownerId)` applies the same
table before the row exists. Changing an event's owner requires management
access to both the old and the new owner.

The audience may reference any group, category or member in the org regardless
of the manager's scope: inviting is not disclosure. Managers see only the
responses to events they manage.

### Viewing and answering

| Visibility | Who can view and RSVP |
| --- | --- |
| `public` | anyone, at `/events/<slug>` and in the portal; anonymous RSVP with name + email |
| `org` | any member with an active membership, in the portal |
| `targeted` | members eligible under the audience rules (portal); external invitees via token |

`draft` events are visible to managers only. `cancelled` events stay visible to
whoever could see them, marked cancelled, RSVP disabled.

Eligibility resolution (`listEligibleMembers`, `isMemberEligible`): the union of
active members of every `group` rule, active members of every group in every
`category` rule, and every `member` rule. `external` rules are not members and
are reached only by token.

## RSVP rules

Pure module `lib/events/rsvp.ts`, no DB access, unit tested.

- **RSVP is open** when `status = published`, and `now ≤ rsvpDeadlineAt` if set,
  and `now ≤ endsAt ?? startsAt` if either is set. Otherwise closed
  (`RSVP_CLOSED`).
- **Seats taken** = `Σ (1 + guestCount)` over responses with
  `answer = yes AND standing = confirmed`.
- A new or changed `yes` with `guestCount = g` is `confirmed` if
  `capacity IS NULL OR taken + 1 + g ≤ capacity`, otherwise `reserve`. A
  response already `confirmed` that raises its guest count beyond capacity goes
  to `reserve` as a whole; it is not split.
- Changing to `no`/`maybe` frees seats. **Nothing is promoted automatically.**
  Managers promote from the reserve list by hand; the action refuses with
  `CAPACITY_EXCEEDED` if the promotion would exceed capacity.
- `guestCount` must be `≤ maxGuestsPerResponse` (`TOO_MANY_GUESTS`).
- Members may change their answer any time RSVP is open. A member outside a
  targeted audience gets `NOT_ELIGIBLE`.
- **Token validity**: token row exists, event not soft-deleted, and RSVP is open
  per the rule above; a token with no event dates and no deadline is valid for
  90 days from `issuedAt`. A logged-in member opening their own token is
  redirected to the portal event page; a logged-in member opening somebody
  else's token is treated as anonymous for that page.
- Reserve order is `respondedAt` ascending (first `yes` wins); shown to
  managers, not enforced on promotion.

## Server modules

### `server/actions/events.ts`

All through `authActionClient` with `requireEventManagementAccess` /
`requireEventOwnerAccess`, `.metadata({ actionName })`, Zod input.

- `createEvent`, `updateEvent`, `publishEvent`, `cancelEvent`, `deleteEvent`
  (soft).
- `setEventAudience` — replaces the full rule list; `addExternalInvitees` —
  emails (deduped, lower-cased), creates `external` rules and a token each.
- `setResponseStanding` (reserve → confirmed, sets `confirmedByUserId`),
  `removeResponse`.
- `sendEventInviteEmails` — input `{ eventId, filter }`; filter ∈
  `all_eligible` · `not_responded` · `not_activated` (eligible members without
  a `userId` or never signed in) · `accepted` · `reserve` · `externals`. Two
  phases behind one action with `dryRun: true|false`: dry run returns the
  recipient count for the confirm dialog; real run issues a token per
  recipient and sends through the existing `sendNotificationEmails` with kind
  `event_invite` and `eventId` set.

Unauthenticated (base `actionClient`):

- `respondWithToken` — `{ token, answer, guestCount }`.
- `respondAsGuest` — public events only; `{ eventSlug, name, email, answer,
  guestCount }`; rate-limited per IP and per event through `rateLimitBuckets`;
  upserts the guest response by email and issues a token shown on the
  confirmation screen so the guest can change their answer later. No email is
  sent.

Portal (`authActionClient` + `requireCurrentMember`):

- `respondToEvent` — `{ eventId, answer, guestCount }`.

### `server/queries/events.ts`

- `listEventsForViewer(ctx)` — portal; returns three buckets: **invited**
  (targeted events where the member is eligible), **open** (public and org-wide
  published events), **past** (anything visible with `endsAt ?? startsAt` in
  the past); each with the member's own response.
- `listEventsForManager(ctx)` — admin table, limited to manageable events.
- `getEventDetail(idOrSlug, viewer)` — enforces visibility.
- `listEligibleMembers(eventId)`, `listEventResponses(eventId)`.
- `getEventRecipients(eventId, filter)` — one function backing both the copy
  buttons and the send dialog, so the two never disagree.

### Retention cron

New route `app/api/internal/shred-event-guests/route.ts`, authorized with
`authorizeCronRequest`, daily. For each event whose `endsAt ?? startsAt` is older
than `eventGuestRetentionDays` (events with no dates: `createdAt` + 180 days):

- delete its `event_rsvp_tokens` and `external` audience rows;
- anonymise guest responses: null `guestEmail` and `guestName`, keep `answer`,
  `guestCount`, `standing` so headcounts survive.

Member responses are kept as attendance history and cascade on member erasure.

## UI

### Admin — `/admin/events`

- List: TanStack table — title, owner, visibility, status, start, confirmed /
  capacity, reserve count. Filters: status, owner. Managers see only events
  they can manage.
- Create / edit sheet (TanStack Form): title (slug auto-derived, editable),
  owner picker limited to owners the viewer may manage, visibility, Tiptap
  description, start / end / all-day, RSVP deadline, location name + address,
  communication link, capacity, max guests per response.
- Detail page `/admin/events/[id]` with tabs:
  - **Overview** — rendered event, status actions (publish / cancel / delete),
    public link when `public`.
  - **Audience** — rule editor: add group, category, member (search), external
    emails (textarea, one per line). Eligible-member count shown live.
  - **Responses** — table: name, email, answer, guests, standing, responded at;
    "Confirm place" on reserve rows; header shows `N confirmed of capacity,
    M in reserve`.
  - **Emails** — one "Copy emails" button per filter (copies a comma-separated
    list to the clipboard), "Send invite email" dialog (filter → recipient
    count → confirm), and the event's send log from `email_activities`.
- Org settings: "Who can create organization-wide events" select
  (`orgEventCreators`) and "Delete guest data N days after an event"
  (`eventGuestRetentionDays`).

### Portal — `/portal/events`

Three sections — **Invited**, **Open to you**, **Past** — each a list of cards
with date, owner, and the member's answer badge. Detail page
`/portal/events/[slug]`: description, when / where, communication link, RSVP
control (yes / no / maybe; guest stepper when `maxGuestsPerResponse > 0`),
standing message ("Confirmed" or "On the reserve list — the organiser will
confirm your place"). Control disabled with a reason when RSVP is closed.

### Public — `/events/[slug]` and `/events/rsvp/[token]`

Wrapped in `PublicShell` (the `/join` and login background). Same event detail
component as the portal. `/events/[slug]` renders only `public` published
events (404 otherwise) with the guest RSVP form (name, email, answer, guests).
`/events/rsvp/[token]` renders the event for any visibility with identity
pre-filled from the token; invalid or expired token shows a plain "this link is
no longer valid" page.

### Shared

- `components/app/events/event-detail.tsx` — the one rendering used by portal,
  public and admin overview.
- `emails/event-invite-email.tsx` — title, when / where, short description
  excerpt, RSVP link (token), communication link.
- All strings in `lib/i18n/messages.ts`, EN and CS.

## Error handling

Typed errors surfaced through the existing safe-action clients and toasts:
`RSVP_CLOSED`, `NOT_ELIGIBLE`, `TOO_MANY_GUESTS`, `TOKEN_INVALID`,
`CAPACITY_EXCEEDED` (manual promotion only), `RATE_LIMITED` (guest RSVP),
`SLUG_TAKEN`. Sending invites reuses the delivery-status tracking of
`email_activities`; a partial Resend failure is reported per recipient in the
send log, not rolled back.

## Testing

- `tests/events-rsvp.test.ts` — pure: standing computation (capacity edge with
  guests, raising guest count past capacity, freeing seats does not promote),
  RSVP-open rule across every combination of dates / deadline / status, token
  validity including the 90-day fallback.
- `tests/events-eligibility.test.ts` — pure: rule union over fixture
  memberships, inactive members excluded, category expands to its groups.
- `tests/events-capacity.test.ts` — DB-backed, skips without Postgres (same
  pattern as `membership-report-freeze.test.ts`): two concurrent `yes`
  responses competing for the last seat end with exactly one `confirmed`
  (the action locks the event row `FOR UPDATE`).

## Follow-ups (Linear)

- Geocoding and map embed for event locations.
- Cover image (needs upload storage).
- Recurring events.
- Edit events inline on the detail page instead of the sheet.
- Access log for viewing response lists (ties into `gdpr-review.md` H6).
- Forms module attached to events (spec 2 of 3).
- Event ticketing on `member_payments` (spec 3 of 3).
