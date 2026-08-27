"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";

import {
  batchLookupWorkspaceUsersAction,
  batchSuggestWorkspaceEmailsAction,
  createWorkspaceAccountAction,
  searchWorkspaceUsersAction,
} from "@/server/actions/member-admin";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import {
  getWorkspaceFieldFormatError,
  normalizeWorkspaceFieldValues,
  type WorkspaceFieldValues,
} from "@/server/lib/workspace/field-catalog";

import { buildWorkspaceQuery } from "./helpers";
import { resolveRowFieldValues } from "./workspace-field-resolution";
import { WorkspaceActionsBar } from "./workspace-actions-bar";
import {
  WorkspaceAccountDefaults,
  type TriState,
} from "./workspace-account-defaults";
import { WorkspaceRowTable } from "./workspace-row-table";
import type {
  FieldTarget,
  GroupAssignmentConfig,
  ImportGroupInfo,
  ParsedRow,
  WorkspaceMatch,
  WorkspaceRowView,
  WorkspaceSearchHit,
} from "./types";

/** How many directory searches to run concurrently. */
const SEARCH_CHUNK_SIZE = 10;

export function StepWorkspaceSync({
  csvHeaders,
  csvRows,
  columnMappings,
  groupAssignment,
  workspaceMatches,
  onWorkspaceMatchesChange,
  onBusyChange,
  provisionFields = [],
  defaultPhoneCountry,
  groupsById,
  orgUnitCategoryId,
}: {
  csvHeaders: string[];
  csvRows: ParsedRow[];
  columnMappings: Record<string, FieldTarget | null>;
  groupAssignment: GroupAssignmentConfig;
  workspaceMatches: Map<number, WorkspaceMatch>;
  onWorkspaceMatchesChange: (matches: Map<number, WorkspaceMatch>) => void;
  onBusyChange: (busy: boolean) => void;
  provisionFields?: EnabledProvisionField[];
  defaultPhoneCountry?: string;
  groupsById?: Map<string, ImportGroupInfo>;
  orgUnitCategoryId?: string | null;
}) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  const [searchColumnKeys, setSearchColumnKeys] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<
    Record<number, WorkspaceSearchHit | null>
  >({});
  const [searching, setSearching] = useState(false);
  /** Drives which of the two batch actions is the primary button. */
  const [searchDone, setSearchDone] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Keyed by CSV row index, never by position in a filtered list — a row
  // leaving the unresolved set must not shift anyone else's suggestion.
  const [targetEmails, setTargetEmails] = useState<Record<number, string>>({});
  const [provisionSelection, setProvisionSelection] = useState<Set<number>>(
    new Set(),
  );
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [perRowExtraFields, setPerRowExtraFields] = useState<
    Map<number, WorkspaceFieldValues>
  >(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [provisioningStatus, setProvisioningStatus] = useState<
    Record<number, "loading" | "error">
  >({});
  const [provisionErrors, setProvisionErrors] = useState<
    Record<number, string>
  >({});
  const [provisioning, setProvisioning] = useState(false);

  // ── Mapped columns ──
  const columnFor = useCallback(
    (target: FieldTarget) =>
      Object.entries(columnMappings).find(([, v]) => v === target)?.[0] ?? null,
    [columnMappings],
  );

  const workspaceEmailCol = useMemo(
    () => columnFor("workspace_email"),
    [columnFor],
  );
  const emailCol = useMemo(() => columnFor("email"), [columnFor]);
  const firstNameCol = useMemo(() => columnFor("first_name"), [columnFor]);
  const lastNameCol = useMemo(() => columnFor("last_name"), [columnFor]);
  const lookupCol = workspaceEmailCol ?? emailCol;

  const unresolvedIndices = useMemo(
    () => csvRows.map((_, i) => i).filter((i) => !workspaceMatches.has(i)),
    [csvRows, workspaceMatches],
  );

  const createdCount = useMemo(
    () =>
      [...workspaceMatches.values()].filter((m) => m.source === "provisioned")
        .length,
    [workspaceMatches],
  );

  // ── Report busy state to the wizard footer ──
  const busy = lookupLoading || searching || provisioning;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  // ── Phase 1: auto-match by email (runs once, on mount) ──
  const batchLookup = useAction(batchLookupWorkspaceUsersAction);

  const runEmailLookup = useCallback(async () => {
    if (!lookupCol) {
      setLookupDone(true);
      return;
    }

    const uniqueEmails = [
      ...new Set(
        csvRows
          .map((row) => (row[lookupCol] ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (uniqueEmails.length === 0) {
      setLookupDone(true);
      return;
    }

    setLookupLoading(true);
    const result = await batchLookup.executeAsync({ emails: uniqueEmails });

    if (result?.data?.results) {
      const newMatches = new Map(workspaceMatches);
      for (let i = 0; i < csvRows.length; i++) {
        const email = (csvRows[i]![lookupCol] ?? "").trim().toLowerCase();
        const match = result.data.results[email];
        if (match) {
          newMatches.set(i, {
            workspaceUserId: match.id,
            workspaceUserEmail: match.primaryEmail,
            fullName: match.fullName,
            source: "email-lookup",
          });
        }
      }
      onWorkspaceMatchesChange(newMatches);
    }

    setLookupLoading(false);
    setLookupDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupCol, csvRows, batchLookup]);

  const lookupStarted = useRef(false);
  useEffect(() => {
    if (lookupStarted.current) return;
    lookupStarted.current = true;
    void runEmailLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seed suggested emails and provisioning field values ──
  const batchSuggest = useAction(batchSuggestWorkspaceEmailsAction);
  const seeded = useRef(false);

  useEffect(() => {
    if (!lookupDone || seeded.current || unresolvedIndices.length === 0) return;
    seeded.current = true;

    const indices = [...unresolvedIndices];

    void (async () => {
      const result = await batchSuggest.executeAsync({
        rows: indices.map((i) => ({
          firstName: (csvRows[i]![firstNameCol ?? ""] ?? "").trim(),
          lastName: (csvRows[i]![lastNameCol ?? ""] ?? "").trim(),
        })),
      });

      const suggestions = result?.data?.suggestions ?? [];
      setTargetEmails((prev) => {
        const next = { ...prev };
        indices.forEach((rowIdx, i) => {
          if (next[rowIdx] === undefined) next[rowIdx] = suggestions[i] ?? "";
        });
        return next;
      });
      setProvisionSelection((prev) => new Set([...prev, ...indices]));
    })();

    if (provisionFields.length > 0) {
      const resolvedByRow = new Map<number, WorkspaceFieldValues>();
      for (const rowIdx of indices) {
        const row = csvRows[rowIdx];
        if (!row) continue;
        const resolved = resolveRowFieldValues(
          row,
          provisionFields,
          columnMappings,
          groupAssignment,
          groupsById,
          orgUnitCategoryId,
          defaultPhoneCountry,
        );
        if (Object.keys(resolved).length > 0) resolvedByRow.set(rowIdx, resolved);
      }
      if (resolvedByRow.size > 0) {
        setPerRowExtraFields((prev) => {
          const next = new Map(prev);
          for (const [k, v] of resolvedByRow) {
            if (!prev.has(k)) next.set(k, v);
          }
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupDone, unresolvedIndices.length]);

  // ── Phase 2: search the directory for every unresolved row ──
  const wsSearch = useAction(searchWorkspaceUsersAction);

  const runSearch = useCallback(async () => {
    if (searching || searchColumnKeys.length === 0) return;

    const targets = unresolvedIndices;
    setSearching(true);
    setSearchProgress({ done: 0, total: targets.length });
    setSearchResults({});

    for (let start = 0; start < targets.length; start += SEARCH_CHUNK_SIZE) {
      const chunk = targets.slice(start, start + SEARCH_CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (rowIdx) => {
          const query = buildWorkspaceQuery(
            csvRows[rowIdx]!,
            searchColumnKeys,
            columnMappings,
          );
          if (!query) return [rowIdx, null] as const;
          const result = await wsSearch.executeAsync({ query });
          return [rowIdx, result?.data?.users?.[0] ?? null] as const;
        }),
      );

      setSearchResults((prev) => {
        const next = { ...prev };
        for (const [rowIdx, hit] of chunkResults) next[rowIdx] = hit;
        return next;
      });
      // A row with a directory candidate must not stay queued for account
      // creation — that is how you end up with a duplicate account for
      // someone who already had one.
      setProvisionSelection((prev) => {
        const next = new Set(prev);
        for (const [rowIdx, hit] of chunkResults) {
          if (hit) next.delete(rowIdx);
        }
        return next;
      });
      setSearchProgress({
        done: Math.min(start + SEARCH_CHUNK_SIZE, targets.length),
        total: targets.length,
      });
    }

    setSearching(false);
    setSearchProgress(null);
    setSearchDone(true);
  }, [
    searching,
    searchColumnKeys,
    unresolvedIndices,
    csvRows,
    columnMappings,
    wsSearch,
  ]);

  /** Row indices that have an unreviewed directory candidate. */
  const hitIndices = useMemo(
    () => unresolvedIndices.filter((i) => searchResults[i]),
    [unresolvedIndices, searchResults],
  );

  const linkHits = useCallback(
    (indices: number[]) => {
      const newMatches = new Map(workspaceMatches);
      for (const rowIdx of indices) {
        const hit = searchResults[rowIdx];
        if (!hit) continue;
        newMatches.set(rowIdx, {
          workspaceUserId: hit.id,
          workspaceUserEmail: hit.primaryEmail,
          fullName: hit.fullName,
          source: "search",
        });
      }
      onWorkspaceMatchesChange(newMatches);
    },
    [searchResults, workspaceMatches, onWorkspaceMatchesChange],
  );

  /** Reject a candidate: the row goes back to being a create-an-account row. */
  const dismissHit = useCallback((rowIdx: number) => {
    setSearchResults((prev) => ({ ...prev, [rowIdx]: null }));
    setProvisionSelection((prev) => new Set(prev).add(rowIdx));
  }, []);

  // ── Phase 3: provision ──
  const createAccount = useAction(createWorkspaceAccountAction);

  const provisionRows = useCallback(
    async (indices: number[]) => {
      if (indices.length === 0) return;
      setProvisioning(true);

      const newMatches = new Map(workspaceMatches);

      for (const rowIdx of indices) {
        setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "loading" }));

        const firstName = (csvRows[rowIdx]![firstNameCol ?? ""] ?? "").trim();
        const lastName = (csvRows[rowIdx]![lastNameCol ?? ""] ?? "").trim();
        const primaryEmail = (targetEmails[rowIdx] ?? "").trim();

        if (!primaryEmail) {
          setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
          setProvisionErrors((prev) => ({
            ...prev,
            [rowIdx]: "No email address",
          }));
          continue;
        }

        // Normalize once more at the point of submission: an admin may have
        // typed "+420 777 123 456" and never left the field.
        const rowExtraFields = normalizeWorkspaceFieldValues(
          perRowExtraFields.get(rowIdx) ?? {},
          defaultPhoneCountry,
        );

        const invalid = Object.keys(rowExtraFields)
          .map((key) =>
            getWorkspaceFieldFormatError(key, rowExtraFields[key]),
          )
          .filter((error): error is string => Boolean(error));

        if (invalid.length > 0) {
          setPerRowExtraFields((prev) =>
            new Map(prev).set(rowIdx, rowExtraFields),
          );
          setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
          setProvisionErrors((prev) => ({ ...prev, [rowIdx]: invalid[0]! }));
          continue;
        }

        // The member's own inbox — deliberately `emailCol`, not `lookupCol`:
        // lookupCol prefers the Workspace column, which is exactly the mailbox
        // the welcome email must not be sent to.
        const notifyEmail = emailCol
          ? (csvRows[rowIdx]![emailCol] ?? "").trim().toLowerCase()
          : "";

        const result = await createAccount.executeAsync({
          firstName,
          lastName,
          primaryEmail,
          notifyEmail: notifyEmail || undefined,
          sendWelcomeEmail,
          extraFields:
            Object.keys(rowExtraFields).length > 0 ? rowExtraFields : undefined,
        });

        if (result?.data?.success) {
          setProvisioningStatus((prev) => {
            const next = { ...prev };
            delete next[rowIdx];
            return next;
          });
          newMatches.set(rowIdx, {
            workspaceUserId: result.data.workspaceUserId!,
            workspaceUserEmail: result.data.primaryEmail!,
            fullName: `${firstName} ${lastName}`.trim(),
            source: "provisioned",
          });
          // Publish after each success so a failure part-way through never
          // discards the accounts that were already created.
          onWorkspaceMatchesChange(new Map(newMatches));
        } else {
          setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
          setProvisionErrors((prev) => ({
            ...prev,
            [rowIdx]: result?.data?.error ?? "Unknown error",
          }));
        }
      }

      setProvisioning(false);
    },
    [
      workspaceMatches,
      csvRows,
      firstNameCol,
      lastNameCol,
      emailCol,
      targetEmails,
      perRowExtraFields,
      defaultPhoneCountry,
      sendWelcomeEmail,
      createAccount,
      onWorkspaceMatchesChange,
    ],
  );

  // ── Row view model ──
  const rows = useMemo<WorkspaceRowView[]>(
    () =>
      csvRows.map((row, rowIdx) => {
        const fieldValues = perRowExtraFields.get(rowIdx) ?? {};
        const fieldErrors: Record<string, string> = {};
        for (const field of provisionFields) {
          const error = getWorkspaceFieldFormatError(
            field.fieldKey,
            fieldValues[field.fieldKey],
          );
          if (error) fieldErrors[field.fieldKey] = error;
        }
        return {
          rowIdx,
          name: `${(row[firstNameCol ?? ""] ?? "").trim()} ${(row[lastNameCol ?? ""] ?? "").trim()}`.trim(),
          sourceEmail: lookupCol ? (row[lookupCol] ?? "").trim() : "",
          match: workspaceMatches.get(rowIdx),
          hit: searchResults[rowIdx],
          provisioning: provisioningStatus[rowIdx],
          provisionError: provisionErrors[rowIdx],
          targetEmail: targetEmails[rowIdx] ?? "",
          selected: provisionSelection.has(rowIdx),
          expanded: expandedRows.has(rowIdx),
          fieldValues,
          requiredMissing: provisionFields.some(
            (f) =>
              f.required && f.type !== "boolean" && !(fieldValues[f.fieldKey] ?? ""),
          ),
          fieldErrors,
        };
      }),
    [
      csvRows,
      firstNameCol,
      lastNameCol,
      lookupCol,
      workspaceMatches,
      searchResults,
      provisioningStatus,
      provisionErrors,
      targetEmails,
      provisionSelection,
      expandedRows,
      perRowExtraFields,
      provisionFields,
    ],
  );

  const selectedUnresolved = unresolvedIndices.filter((i) =>
    provisionSelection.has(i),
  );

  /**
   * Selected rows we could create an account for but not tell anyone about:
   * with no personal email there is no inbox to send the temporary password
   * to, since the new Workspace mailbox needs that password to be opened.
   */
  const unnotifiableCount = useMemo(
    () =>
      selectedUnresolved.filter(
        (i) => !emailCol || !(csvRows[i]![emailCol] ?? "").trim(),
      ).length,
    [selectedUnresolved, emailCol, csvRows],
  );

  // ── Bulk defaults for the yes/no account settings ──
  const booleanFields = useMemo(
    () => provisionFields.filter((f) => f.type === "boolean"),
    [provisionFields],
  );

  const booleanDefaults = useMemo(() => {
    const result: Record<string, TriState> = {};
    for (const field of booleanFields) {
      const values = unresolvedIndices.map(
        (i) => perRowExtraFields.get(i)?.[field.fieldKey] === true,
      );
      result[field.fieldKey] =
        values.length === 0
          ? false
          : values.every(Boolean)
            ? true
            : values.some(Boolean)
              ? "indeterminate"
              : false;
    }
    return result;
  }, [booleanFields, unresolvedIndices, perRowExtraFields]);

  const setBooleanForAll = useCallback(
    (fieldKey: string, value: boolean) => {
      setPerRowExtraFields((prev) => {
        const next = new Map(prev);
        for (const rowIdx of unresolvedIndices) {
          next.set(rowIdx, { ...(prev.get(rowIdx) ?? {}), [fieldKey]: value });
        }
        return next;
      });
    },
    [unresolvedIndices],
  );

  const matchedBySource = useMemo(() => {
    const counts = { "email-lookup": 0, search: 0, provisioned: 0 };
    for (const m of workspaceMatches.values()) counts[m.source] += 1;
    return counts;
  }, [workspaceMatches]);

  // ── Render ──
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Workspace Accounts</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Link imported members to their Google Workspace accounts.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-3 py-2">
        {lookupLoading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin text-primary" />
            Looking up workspace accounts by email…
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">
              {workspaceMatches.size}
            </strong>{" "}
            of <strong className="text-foreground">{csvRows.length}</strong>{" "}
            linked
            {matchedBySource["email-lookup"] > 0 &&
              ` · ${matchedBySource["email-lookup"]} by email`}
            {matchedBySource.search > 0 &&
              ` · ${matchedBySource.search} by search`}
            {matchedBySource.provisioned > 0 &&
              ` · ${matchedBySource.provisioned} created`}
            {hitIndices.length > 0 && (
              <span className="font-medium text-primary">
                {" "}
                · {hitIndices.length} awaiting your review
              </span>
            )}
            {unresolvedIndices.length - hitIndices.length > 0 &&
              ` · ${unresolvedIndices.length - hitIndices.length} need attention`}
          </span>
        )}
      </div>

      {createdCount > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-amber-600" />
          {createdCount} Google account{createdCount !== 1 ? "s have" : " has"}{" "}
          been created. They remain even if you cancel this import.
        </p>
      )}

      {!lookupLoading && unresolvedIndices.length > 0 && (
        <WorkspaceActionsBar
          unresolvedCount={unresolvedIndices.length}
          selectedCount={selectedUnresolved.length}
          hitCount={hitIndices.length}
          onLinkAll={() => linkHits(hitIndices)}
          searchDone={searchDone}
          csvHeaders={csvHeaders}
          searchColumnKeys={searchColumnKeys}
          onSearchColumnsChange={(keys) => {
            setSearchColumnKeys(keys);
            setSearchResults({});
            setSearchDone(false);
          }}
          onSearch={() => void runSearch()}
          searching={searching}
          searchProgress={searchProgress}
          sendWelcomeEmail={sendWelcomeEmail}
          onSendWelcomeEmailChange={setSendWelcomeEmail}
          unnotifiableCount={unnotifiableCount}
          onProvision={() => void provisionRows(selectedUnresolved)}
          provisioning={provisioning}
        />
      )}

      {!lookupLoading && unresolvedIndices.length > 0 && (
        <WorkspaceAccountDefaults
          fields={booleanFields}
          values={booleanDefaults}
          onChange={setBooleanForAll}
        />
      )}

      <WorkspaceRowTable
        rows={rows}
        provisionFields={provisionFields}
        defaultPhoneCountry={defaultPhoneCountry}
        loading={lookupLoading}
        searching={searching}
        onToggleExpanded={(rowIdx) =>
          setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowIdx)) next.delete(rowIdx);
            else next.add(rowIdx);
            return next;
          })
        }
        onToggleSelected={(rowIdx, selected) =>
          setProvisionSelection((prev) => {
            const next = new Set(prev);
            if (selected) next.add(rowIdx);
            else next.delete(rowIdx);
            return next;
          })
        }
        onToggleAll={(selected) =>
          setProvisionSelection(selected ? new Set(unresolvedIndices) : new Set())
        }
        onTargetEmailChange={(rowIdx, value) =>
          setTargetEmails((prev) => ({ ...prev, [rowIdx]: value }))
        }
        onFieldChange={(rowIdx, fieldKey, value) =>
          setPerRowExtraFields((prev) => {
            const next = new Map(prev);
            next.set(rowIdx, {
              ...(prev.get(rowIdx) ?? {}),
              [fieldKey]: value,
            });
            return next;
          })
        }
        onLinkHit={(rowIdx) => linkHits([rowIdx])}
        onDismissHit={dismissHit}
        onRetry={(rowIdx) => void provisionRows([rowIdx])}
      />
    </div>
  );
}
