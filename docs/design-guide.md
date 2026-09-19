# Design guide

How Spoleek pages look and which building blocks make them. Read this before
designing a new page or touching an existing one. The rules are short on
purpose; the primitives carry the rest.

## 1. The look in one paragraph

Quiet, editorial, green. One serif title anchors each page; everything else
is sans. Hairlines instead of shadows, white cards on a white canvas with a
1px ring, colour spent only where it means something (status, one accent
rail on a notice, the primary button). The layout is calm and left-aligned,
with reading-width columns for text and forms and the full canvas for
tables and dashboards.

## 2. Typography

Two families, loaded in `app/layout.tsx`:

| Token | Family | Tailwind class | Used for |
|---|---|---|---|
| `--font-heading` | Lora (serif) | `font-heading` | Page titles and long-form prose only |
| `--font-sans` | Geist | default | Everything else |
| `--font-mono` | IBM Plex Mono | `font-mono` | Bank numbers, slugs, code |

**The serif is opt-in.** There is no global rule that makes headings serif;
a component must ask with `font-heading`. Where it may:

- The page title — `AppPage` and `DetailHeader` do this for you.
- Hero titles on signed-out pages (login, join, public event, public form).
- Headings inside prose the reader consumes as a document: `.policy-prose`,
  the group notice board, form-filler section headings.
- The numeral in `EventDateLeaf` — the one decorative exception.

Where it may not: section headings, card / dialog / notice titles, stat
values, table headers, badges, buttons, labels, tabs, empty states, numbers
of any kind. If it sits inside a bordered box, it is sans. If you find
yourself writing `font-heading` outside the list above, stop.

Sizes are fixed per role, not per page:

| Role | Classes |
|---|---|
| Page / entity title | `font-heading text-2xl font-semibold tracking-tight md:text-3xl` |
| Eyebrow above a title | `PageEyebrow` (`text-xs font-semibold uppercase tracking-wider text-muted-foreground/80`) |
| Section heading | `PageSectionHeader` (`text-base font-semibold`) with a muted tabular count |
| Card title | `CardTitle` (`text-base font-medium`) |
| Body | `text-sm`; long prose `text-[0.9375rem] leading-relaxed` |
| Meta / hint | `text-xs text-muted-foreground` |
| Stat value | `StatValue` (`text-3xl font-semibold tabular-nums`) |

Numbers that get compared in a column are always `tabular-nums`.

## 3. Page frames

Every signed-in page uses exactly one of these and nothing hand-rolled.

### `AppPage` — `components/app/app-page.tsx`

Eyebrow, serif title, one-line description, actions on the right, hairline,
content. Props that matter:

- `width="full"` (default) — tables, dashboards, anything that earns the
  whole canvas.
- `width="content"` — forms, settings, reading pages. Capped at `max-w-4xl`
  and centred, so the form does not sit in the corner of a wide screen. Do
  not add another `max-w-*` inside; let the page cap decide.
- `aside` — a 20rem right column on large screens (help, status, related
  links). Use it to give a `content` page something to do with the leftover
  width instead of widening the form.

### `DetailHeader` — `components/app/detail-header.tsx`

For a page about one thing: an event, a group, a member, a form. Back link,
then leading visual (date leaf, avatar) beside status pills, the serif
title, and one line of icon facts (`DetailMeta` / `DetailMetaItem`).
Actions on the right. Pair it with `Tabs` for the sub-views and, when the
body is long, a `lg:grid-cols-[minmax(0,1fr)_20rem]` split with facts in
the right column (`FactRow` in a `factCardClassName` box).

### Tabs inside a page

A full-width page with tabs keeps every tab left-aligned. A form tab uses a
left-aligned `max-w-3xl`; it does not centre itself. A table tab is full
width. `TabBody` in `event-admin-detail.tsx` is the pattern.

## 4. Sections and blocks

- `PageSection` / `PageSectionHeader` — a titled block within a page. Sans
  title, optional muted `count`, and either a `hint` (short muted text) or an
  `action` (button / link) on the right, never both.
- `StatGroup` + `Stat` — the only way to show a number that matters.
  `variant="cards"` for stand-alone tiles, `strip` for one framed band,
  `inset` at the bottom of a card. Values are sans, tabular.
- `Card` — a bordered surface for a *thing*: a group, a payment, a setting
  group. Not for layout. Nested cards are a smell.
- `FieldSet` + `FieldLegend` — grouping inside a form. Not `PageSection`.
- `Empty` — the calm empty state (`EmptyMedia`, `EmptyTitle`, `EmptyDescription`).
  Dashboards use the smaller `AllClear` / `EmptyNote` from
  `dashboard-primitives.tsx`.
- Lists of rows use `ListRow` (dashboard) or `Item` (generic) — hairline
  between rows, hover tint, arrow on hover.

## 5. Messages

Three channels; pick by *what happened*, not by how important it feels.

| Situation | Component |
|---|---|
| A standing state the reader must deal with: cancelled event, unpaid fee, report missing people, profile incomplete | `Notice` (`components/ui/notice.tsx`) |
| Feedback on the action just taken inside a form or dialog: validation failed, save failed | `Alert` inline, `variant="destructive"` when it failed |
| Confirmation that an action succeeded | `toast` (sonner) — never a banner |
| Yes/no before something destructive | `AlertDialog` |

`Notice` tones: `neutral` context · `info` a fact worth a box · `success`
a confirmed good state · `attention` somebody must resolve this eventually ·
`danger` blocked or broken. Colour goes on the rail and icon only, so two
notices on one page do not shout. Give it `max-w-4xl` on a full-width page.

Do not hand-roll a banner with `border-amber-500/30 bg-amber-500/5`. That
is what `Notice` is for; if it lacks something, extend it.

## 6. Overlays

- `FormDialog` — every create / edit form. Bordered header, scrolling body,
  fixed footer with Cancel + submit. The form renders with an `id` and the
  footer submits it via `form={id}`. `footerStart` for a delete button.
- `DetailDialog` — the read-mostly sibling: a record's details, a preview,
  or a body that brings its own submit.
- `Dialog` directly — only for tiny one-field prompts.
- `Sheet` — the mobile sidebar. Nothing else. Do not add a right-hand sheet.
- `Popover` / `DropdownMenu` — actions and pickers attached to a control.

## 7. Colour

Tokens live in `app/globals.css`; use them, never raw hex.

- `primary` (green) — the one filled button per view, links, the active
  state. Not a background for large areas.
- `muted` / `muted-foreground` — secondary text, empty states, inset panels.
- Status colours — via `Status` (dot + label), `Badge`, and `Stat` tones.
  Green = good/paid, blue = pending/info, orange = attention/overdue soon,
  red = broken/overdue/refund due. Keep the mapping; do not invent a fifth.
- Dark mode is automatic through the tokens. Test both.

## 8. Spacing and rhythm

- Page padding is set by the shell (`p-4 md:p-6`); pages do not add their
  own horizontal padding.
- Vertical rhythm inside a page: `gap-6` between blocks, `gap-3` between a
  heading and its content, `gap-4` in card bodies.
- Radii: `rounded-xl` for cards and notices, `rounded-lg` for inputs and
  buttons, `rounded-md` for rows and chips. Nothing rounder than `xl` except
  avatars and dots.
- Icons in meta lines are `size-3.5`, in buttons `size-4`, in notice tiles
  `size-4` inside a `size-8` box.

## 9. Motion

One staggered reveal on page load (`reveal(index)` from
`dashboard-primitives.tsx`) and hover / focus transitions. No decorative
animation, no motion on numbers.

## 10. Copy

- English is primary; strings go through `lib/i18n/messages.ts`.
- Titles are sentences with a full stop in the portal ("Your profile.",
  "Hi Martin, welcome back.") and bare nouns in admin ("Payments",
  "Settings"). Keep that split — the portal talks to a person, admin labels
  a tool.
- Descriptions are one line, no trailing period rules beyond that.
- Buttons are verb + object ("Create profile", "Mark paid"), never "OK",
  "Submit" or "Yes".
- Empty states say what would fill them, not that they are empty.

## 11. Before you ship a page

- [ ] Uses `AppPage` or `DetailHeader`; no hand-rolled header.
- [ ] Exactly one `font-heading` element visible (the title), unless prose.
- [ ] `width` chosen deliberately; no stray `max-w-*` on a `content` page.
- [ ] Sections via `PageSectionHeader`; numbers via `Stat`.
- [ ] Standing messages are `Notice`; form feedback is `Alert`; success is a toast.
- [ ] Forms open in `FormDialog`, never a `Sheet`.
- [ ] Looks right at 375px and 1800px, light and dark.
