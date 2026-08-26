# Member CSV Import — UX Redesign

**Date:** 2026-08-26
**Scope:** `components/app/member-import/`
**Status:** Approved design, ready for implementation planning

## Problem

The import wizard runs two competing navigation systems. The dialog shell
(`member-import-dialog.tsx`) establishes a contract that the bottom-right
primary button advances the wizard. Every step honours it except Workspace,
which adds its own phase pills, three in-content forward buttons, and a skip
link — five forward affordances on one screen. The one in the position users
trust is the one that abandons their work.

Two consequences reported directly by the user:

1. Continue looks clickable while a search or provisioning run is in flight.
   It is: `canAdvanceFrom` returns `true` unconditionally for `workspace`.
   Clicking navigates away while `createAccount.executeAsync` keeps firing
   against Google.
2. After confirming rows in the provision table, users reach for Continue
   rather than `Provision N accounts`. Both are the `default` button variant —
   two primaries in one viewport, and the conventional position wins.

## Defects found during analysis

These are functional, not cosmetic, and the redesign must resolve them.

**D1 — Provisioned rows vanish.** `unmatchedIndices` derives from
`!workspaceMatches.has(i)`. On success `provisionSelected` writes into
`workspaceMatches`, so the row drops out of the rendered list immediately. The
`Created` badge is unreachable; users watch rows disappear with no confirmation.

**D2 — Email suggestions misalign.** The provision table reads
`suggestions[i]` where `i` is the positional index in the *current*
`unmatchedIndices`, but `suggestions` was captured against an older, longer
list. Any row leaving the list shifts every later suggestion. Guaranteed to
fire in combination with D1.

**D3 — Search reaches only 10 rows.** Both `runSearch` and the results table
slice to 10 unmatched rows, with no path to the remainder. The following
button still reads "Provision accounts for unmatched", implying search was
exhaustive.

**D4 — Preview edits destroyed on Back.** The dialog reassembles
`editableRows` from scratch on every entry into preview. Edit cells → Back →
Continue → edits gone, silently.

**D5 — Email-lookup table truncates at 20 rows** with no indicator.

**D6 — Provisioning is irreversible and uncommunicated.** It creates real
Google Workspace accounts mid-wizard. Cancelling the dialog afterwards leaves
the accounts in place with zero members imported. Nothing says so.

## Design

### 1. Step gate contract

Replace the boolean `canAdvanceFrom` with a descriptor each step reports
upward:

```ts
type StepGate = {
  blocked?: { reason: string };
  busy?: boolean;
  pending?: { summary: string; detail: string };
};
```

The dialog holds `Record<WizardStep, StepGate>` in state; steps push changes
through an `onGateChange` prop. The footer renders purely from the active
step's gate, with no step-specific branching — the absence of that rule is
what let the current footer drift.

| Gate | Footer right button |
| --- | --- |
| `blocked` | disabled; `reason` rendered as muted text immediately to its left |
| `busy` | disabled; label unchanged |
| `pending` | `outline` variant, label `Continue anyway`, click opens confirm |
| clear | `default` variant, label `Continue` |
| preview (terminal) | `Import N members` |

`busy` is the direct fix for complaint 1. The `outline` demotion under
`pending` is the direct fix for complaint 2: it guarantees the in-content
batch action is the only primary on screen at the moment it matters.

### 2. Pending confirmation

Advancing past unfinished optional work proceeds, but names the consequence at
click time.

The confirm is a **Popover anchored to the footer button**, not a nested
dialog. The dialog shell already carries explicit `data-slot="popover-content"`
guards in `onInteractOutside` and `onFocusOutside`, so popovers are the
escape-hatch this shell supports; a nested `AlertDialog` would contend with
the focus trap.

Content: `summary` as the heading, `detail` as body, actions `Go back`
(dismiss) and `Continue anyway` (advance).

Steps that declare `pending`:

- **workspace** — any unresolved rows remain.
- **groups** — `mode === "column"` and *every* column value maps to null.
  Partial mapping is a legitimate choice and stays silent; zero mapping is
  almost always a mistake.
- **preview** — reassembly discarded prior cell edits (see D4).
- No other step declares it.

### 3. Workspace step rebuilt

`step-workspace-sync.tsx` is 1093 lines doing five jobs. It splits into:

| File | Responsibility |
| --- | --- |
| `step-workspace-sync.tsx` | orchestration, server actions, gate reporting |
| `workspace-row-table.tsx` | the unified row table |
| `workspace-row-fields.tsx` | expandable per-row provision fields (lifted unchanged) |
| `workspace-actions-bar.tsx` | search and create-accounts batch actions |

The three phases are not parallel modes. They are a funnel over one dataset:
auto-match by email, search the leftovers, create accounts for what remains.
The redesign models it as such — a single table of every CSV row with a
per-row status.

**Rows are never filtered out of the table.** The list is keyed by `rowIdx`
and rendered from `csvRows` in full. `unmatchedIndices` stops being the render
source and becomes only a selector for batch operations. This resolves D1.

**`suggestions` becomes `Record<number, string>`** keyed by row index rather
than a positional array, so it cannot desynchronise. This resolves D2.

Row state machine:

```
unresolved ──email lookup──> matched
           ──search+confirm─> matched
           ──provision──────> creating ──> created ──> matched
                                       └─> failed (retryable, stays visible)
```

Surfaced as a status column: `Matched by email`, `Found by search`,
`Will be created`, `Creating…`, `Created ✓`, `Failed — <reason>` with a
`Retry` action. Matched rows collapse to a compact line; unresolved rows
expand to show the editable target email and the provision-fields disclosure.

**Header summary** replaces the phase pills:

```
32 of 40 linked · 26 by email · 6 by search · 8 need attention
```

**Batch action bar**, operating on unresolved rows only:

- `Search unmatched by name` — column picker in a popover, replacing the
  always-visible checkbox row. Runs against **all** unresolved rows in chunks
  with a progress count. Resolves D3.
- `Create N accounts` — `default` variant while unresolved rows exist, which
  is exactly when the footer is `outline`. Exactly one primary on screen at
  all times.

**Irreversibility notice** (D6): once any account has been created, a
persistent muted line under the summary reads *"N Google accounts have been
created. They remain even if you cancel this import."*

The email-lookup result view no longer truncates to 20 rows — it is the same
unified table (D5).

The phase pills, the `SyncPhase` state, and the `Skip workspace matching →`
link are deleted. The footer's `outline` Continue is the skip, and it names
its consequence.

### 4. Other steps

**Map Fields** — both alerts move above the table. The `!hasName` alert is
then redundant with the footer's `blocked.reason` and is removed; only the
duplicate-mapping warning remains at the top. A summary line is added under
the heading: `5 of 7 columns mapped · 2 ignored`.

**Preview** — the four stacked chrome blocks collapse to two: the
duplicate-email warning (conditional) and the default-status switch. The
additive-import alert becomes one muted sentence under the heading; the
row-count box is removed, since it repeats both the switch above it and the
footer button label.

D4 is fixed by guarding reassembly with a fingerprint of the upstream inputs
(`columnMappings`, `groupAssignment`, `workspaceMatches`, `importStatus`, row
count). Re-entering preview with an unchanged fingerprint keeps the edited
rows; a changed fingerprint reassembles and declares a `pending` gate on the
way forward so the loss is never silent.

**Upload** — add a `Download template CSV` link generated from the
organisation's actual custom fields.

**Groups** — unchanged apart from the `pending` gate described above.

### 5. Accessibility

- Convert the four grid-of-divs tables to real `<table>` markup with
  `<th scope="col">`. Preview is already a real table.
- Replace the literal `▶` text glyph on the row expander with
  `ChevronRightIcon` from `lucide-react`.
- Add a select-all checkbox to the provision table header.
- Every disabled control gets an accessible reason via `aria-describedby`
  pointing at the footer reason text.

## Sequencing

Three independently shippable stages:

1. Step gate contract, footer rendering, pending confirmation popover.
2. Workspace step rebuild (splits, unified table, D1/D2/D3/D5/D6).
3. Small-step polish (Map Fields, Preview/D4, Upload) and the accessibility
   pass.

## Testing

The repository has no component test infrastructure, so verification is
`pnpm typecheck` and `pnpm lint` plus a manual matrix:

- CSV where all emails match Workspace accounts; none match; some match.
- Provisioning succeeds for all selected rows.
- Provisioning fails mid-batch — remaining rows still process, failed rows
  stay visible and retryable.
- Back-navigation after editing preview cells, with and without an upstream
  change in between.
- `workspaceReady === false` — the Workspace step is absent and navigation
  skips it cleanly.
- Continue is inert while lookup, search, and provisioning are in flight.

## Open questions

None. Two judgement calls were made explicitly:

- Moving the search column picker into a popover trades some discoverability
  for a calmer default view. Accepted; revisit if users routinely search by
  non-obvious columns.
- Groups declares `pending` only on a fully unmapped column, not a partially
  unmapped one, to avoid warning about a normal choice.
