# Custom field validation constraints

**Date:** 2026-09-02
**Status:** implemented

## Problem

Member custom fields (`member_custom_fields`) can declare a type and a `required`
flag, but nothing else. An organization that needs "applicants must be 18 or
older", "jersey number between 1 and 99", or "national ID in the format
`AB123456`" has no way to express it, so bad answers reach the database and are
cleaned up by hand.

## Approach

One `constraints jsonb` column carrying admin-defined validation rules, a single
pure module that interprets them, and two consumers: the member-facing widgets
(convenience) and `normalizeFieldInputValue` (authority).

Rejected alternative: discrete typed columns (`min_age`, `max_value`,
`min_length`, …). Queryable and `CHECK`-able, but it means ~10 mostly-null
columns today and a migration for every future rule. These values are form
validation rules, never query predicates, so the indexing benefit is unused.

## Storage

`member_custom_fields.constraints jsonb NOT NULL DEFAULT '{}'`. Not nullable:
`NULL` and `{}` would mean the same thing, and removing the distinction removes a
null check from every read site.

Keys, by the field type that reads them:

| Type | Keys |
| --- | --- |
| `date` | `minAge`, `maxAge`, `notBefore`, `notAfter`, `direction` — one group at a time (below) |
| `number` | `min`, `max`, `integerOnly` |
| `text`, `textarea` | `minLength`, `maxLength`, `format`, `pattern`, `patternMessage` |
| `multi_select` | `minSelected`, `maxSelected` |
| `boolean`, `email`, `phone`, `select` | none |

`pickConstraintsForType` strips keys foreign to the selected type on save and
again on read, so changing a field's type never leaves a stale rule in force.

## Exclusive date rule groups

The three kinds of date rule overlap: `minAge: 0` already implies past-only, and
`direction: "future"` combined with any age limit yields an empty window that
rejects every date with nothing on screen explaining why. So only one group
applies at a time:

| Group | Keys |
| --- | --- |
| age | `minAge`, `maxAge` |
| range | `notBefore`, `notAfter` |
| direction | `direction` (`"any"` counts as unset) |

There is no stored mode flag. `getDateMode` derives the active group from
whichever keys carry a value, and `pickConstraintsForType` strips the other
groups' keys on write and on read — so a rule the admin cannot see can never
still be in force, and no flag can drift out of sync with the values.

The editor shows all five inputs from the start and disables the two inactive
groups as soon as one is filled in; clearing it releases the others. Nothing is
hidden, so the admin can see what is available without first choosing a mode.

The cost of exclusivity is that "18+ **and** born after 1990" is not
expressible; that combination is rare enough not to justify three intersecting
rule groups.

## Age semantics

Age is full years elapsed, evaluated against `new Date()` at submit time. The
rule is `minAge <= age <= maxAge` — both bounds inclusive. Someone turning
`minAge` on the day they submit qualifies, and `maxAge: 26` admits every day up
to and including the day before the 27th birthday. `notBefore`/`notAfter` are
inclusive likewise, and both direction locks admit today. The editor states this
on each input, since off-by-one guesses here are silent and costly.

Age is stored as a number of years, never as a precomputed cut-off date: "18+"
resolves to a different date every day, and a stored cut-off silently rots.

Derived picker bounds:

- `max = subYears(now, minAge)` — anything later is too young.
- `min = addDays(subYears(now, maxAge + 1), 1)` — the day before turning
  `maxAge + 1` is still in; the birthday itself is out.

Both the calendar bounds and the server check derive from these same functions,
which is what prevents the calendar from offering a date the server rejects.

## Regex safety

Admin-supplied patterns run server-side on every public `/join` submit. Four
guards:

1. Compiled at **save** time; an invalid pattern is a validation error on the
   field config, not a runtime failure.
2. Capped at 200 characters.
3. Matched only **after** the length check, with `maxLength` defaulting to 512
   for custom-format fields, so unbounded input never reaches the matcher.
4. Anchored with `^…$` automatically unless already anchored, so a pattern
   matches the whole answer rather than a substring.

`patternMessage` lets the admin supply a human hint ("must be two letters then
six digits"); without it members see a generic format error.

## Modules

- `lib/member-custom-field-constraints.ts` — Zod schema, `validateFieldConstraints`,
  `getDateConstraintBounds`, `getTextPattern`, `pickConstraintsForType`. Pure: no
  DB, no React.
- `lib/member-custom-fields.ts` — `memberCustomFieldSchema` gains `constraints`
  plus coherence checks (`minAge <= maxAge`, valid regex, …);
  `normalizeFieldInputValue` calls `validateFieldConstraints` on every branch.
- `components/app/member-custom-field-constraint-fields.tsx` — admin editor,
  switching on the selected type.
- `components/app/member-custom-field-input.tsx` — feeds bounds to the widgets:
  `DatePicker` gets `disabledDates`/`startMonth`/`endMonth`, number inputs get
  `min`/`max`/`step`, text gets `maxLength` and a character counter,
  multi-select gets a "select 2 to 3" hint.
- `server/actions/member-custom-fields.ts` — persists constraints through
  `pickConstraintsForType`.

## Failure behaviour

A violated constraint is an ordinary validation error, identical in shape to the
existing `${label} must be a valid date.`, surfaced through `FieldError`. It
blocks submission on `/join` and in the admin editor alike. No new error channel
and no "flag for review" state.

## Out of scope

Conditional visibility (show a field only when another field equals X) needs a
dependency graph in the renderer rather than a per-field validator, and is
deliberately left for a later change. Same for `unique` constraints, which need
a cross-member query rather than a pure function.
