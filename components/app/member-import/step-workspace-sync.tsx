"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  batchLookupWorkspaceUsersAction,
  batchSuggestWorkspaceEmailsAction,
  createWorkspaceAccountAction,
  searchWorkspaceUsersAction,
} from "@/server/actions/member-admin";

import { buildWorkspaceQuery } from "./helpers";
import type {
  FieldTarget,
  GroupAssignmentConfig,
  ImportGroupInfo,
  ParsedRow,
  WorkspaceMatch,
} from "./types";
import { applyFormatTemplate } from "@/server/lib/workspace/field-catalog";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import type { WorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";

type SyncPhase = "email-lookup" | "search" | "provision";

function getAssignedGroup(
  row: ParsedRow,
  groupAssignment: GroupAssignmentConfig,
  groupsById: Map<string, ImportGroupInfo> | undefined,
  categoryId?: string | null,
): ImportGroupInfo | null {
  if (!groupsById) return null;

  let groupId: string | null = null;
  if (groupAssignment.mode === "column" && groupAssignment.columnMapping) {
    const colVal = (
      row[groupAssignment.columnMapping.columnKey] ?? ""
    ).trim();
    groupId = groupAssignment.columnMapping.valueToGroupId[colVal] ?? null;
  } else if (
    groupAssignment.mode === "fixed" &&
    groupAssignment.fixedGroupIds.length > 0
  ) {
    if (categoryId) {
      groupId =
        groupAssignment.fixedGroupIds.find((id) => {
          const g = groupsById.get(id);
          return g?.categoryId === categoryId;
        }) ?? null;
    } else {
      groupId = groupAssignment.fixedGroupIds[0] ?? null;
    }
  }

  return groupId ? (groupsById.get(groupId) ?? null) : null;
}

function resolveRowFieldValues(
  row: ParsedRow,
  fieldConfigs: EnabledProvisionField[],
  columnMappings: Record<string, FieldTarget | null>,
  groupAssignment: GroupAssignmentConfig,
  groupsById: Map<string, ImportGroupInfo> | undefined,
  orgUnitCategoryId: string | null | undefined,
): WorkspaceFieldValues {
  const result: WorkspaceFieldValues = {};

  const emailCol = Object.entries(columnMappings).find(
    ([, v]) => v === "email",
  )?.[0];
  const memberEmail = emailCol ? (row[emailCol] ?? "").trim() : "";

  for (const field of fieldConfigs) {
    const source = field.source;

    // 1. Try explicit auto-fill source
    if (source && source.type !== "manual") {
      if (source.type === "member_custom_field") {
        const col = Object.entries(columnMappings).find(
          ([, v]) => v === `custom:${source.customFieldKey}`,
        )?.[0];
        if (col) {
          const val = (row[col] ?? "").trim();
          if (val) { result[field.fieldKey] = val; continue; }
        }
      } else if (
        source.type === "group_category" ||
        source.type === "org_unit_auto"
      ) {
        const catId =
          source.type === "group_category"
            ? source.categoryId
            : orgUnitCategoryId;
        const grp = getAssignedGroup(row, groupAssignment, groupsById, catId);
        if (grp) {
          if (source.type === "org_unit_auto") {
            if (grp.workspaceOrgUnitPath) {
              result[field.fieldKey] = grp.workspaceOrgUnitPath;
              continue;
            }
          } else {
            const formatted = applyFormatTemplate(
              source.formatTemplate,
              grp.name,
            );
            if (formatted) { result[field.fieldKey] = formatted; continue; }
          }
        }
      }
    }

    // 2. Smart fallback: derive from CSV mappings / group assignment
    if (field.fieldKey === "recoveryEmail" && memberEmail) {
      result[field.fieldKey] = memberEmail;
    } else if (field.fieldKey === "orgUnitPath") {
      const grp = getAssignedGroup(
        row, groupAssignment, groupsById, orgUnitCategoryId,
      );
      if (grp?.workspaceOrgUnitPath) {
        result[field.fieldKey] = grp.workspaceOrgUnitPath;
      }
    } else if (field.fieldKey === "department") {
      const grp = getAssignedGroup(row, groupAssignment, groupsById);
      if (grp) result[field.fieldKey] = grp.name;
    } else if (field.type !== "boolean") {
      // Try matching a mapped custom field by key name
      const col = Object.entries(columnMappings).find(
        ([, v]) => v === `custom:${field.fieldKey}`,
      )?.[0];
      if (col) {
        const val = (row[col] ?? "").trim();
        if (val) result[field.fieldKey] = val;
      }
    }
  }

  return result;
}

export function StepWorkspaceSync({
  csvHeaders,
  csvRows,
  columnMappings,
  groupAssignment,
  workspaceMatches,
  onWorkspaceMatchesChange,
  onSkip,
  provisionFields = [],
  groupsById,
  orgUnitCategoryId,
}: {
  csvHeaders: string[];
  csvRows: ParsedRow[];
  columnMappings: Record<string, FieldTarget | null>;
  groupAssignment: GroupAssignmentConfig;
  workspaceMatches: Map<number, WorkspaceMatch>;
  onWorkspaceMatchesChange: (matches: Map<number, WorkspaceMatch>) => void;
  onSkip: () => void;
  provisionFields?: EnabledProvisionField[];
  groupsById?: Map<string, ImportGroupInfo>;
  orgUnitCategoryId?: string | null;
}) {
  const [phase, setPhase] = useState<SyncPhase>("email-lookup");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  // Phase 2 state
  const [searchColumnKeys, setSearchColumnKeys] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<
    Record<
      string,
      { id: string; primaryEmail: string; fullName: string } | null
    >
  >({});
  const [searchLoading, setSearchLoading] = useState(false);

  // Phase 3 state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [editedEmails, setEditedEmails] = useState<Record<number, string>>({});
  const [provisionSelection, setProvisionSelection] = useState<Set<number>>(
    new Set(),
  );
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [perRowExtraFields, setPerRowExtraFields] = useState<
    Map<number, WorkspaceFieldValues>
  >(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [provisioningStatus, setProvisioningStatus] = useState<
    Record<number, "pending" | "loading" | "success" | "error">
  >({});
  const [provisionErrors, setProvisionErrors] = useState<
    Record<number, string>
  >({});

  // Find which column is mapped to workspace_email or email
  const workspaceEmailCol = useMemo(
    () =>
      Object.entries(columnMappings).find(
        ([, v]) => v === "workspace_email",
      )?.[0] ?? null,
    [columnMappings],
  );

  const emailCol = useMemo(
    () =>
      Object.entries(columnMappings).find(([, v]) => v === "email")?.[0] ??
      null,
    [columnMappings],
  );

  const lookupCol = workspaceEmailCol ?? emailCol;

  const firstNameCol = useMemo(
    () =>
      Object.entries(columnMappings).find(([, v]) => v === "first_name")?.[0] ??
      null,
    [columnMappings],
  );

  const lastNameCol = useMemo(
    () =>
      Object.entries(columnMappings).find(([, v]) => v === "last_name")?.[0] ??
      null,
    [columnMappings],
  );

  const unmatchedIndices = useMemo(
    () => csvRows.map((_, i) => i).filter((i) => !workspaceMatches.has(i)),
    [csvRows, workspaceMatches],
  );

  // ── Phase 1: Auto-match by email ──
  const batchLookup = useAction(batchLookupWorkspaceUsersAction);

  const runEmailLookup = useCallback(async () => {
    if (!lookupCol || lookupLoading) return;

    const emails = csvRows
      .map((row) => (row[lookupCol] ?? "").trim().toLowerCase())
      .filter(Boolean);

    const uniqueEmails = [...new Set(emails)];
    if (uniqueEmails.length === 0) {
      setLookupDone(true);
      setPhase("search");
      return;
    }

    setLookupLoading(true);
    const result = await batchLookup.executeAsync({
      emails: uniqueEmails,
    });

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
  }, [
    lookupCol,
    lookupLoading,
    csvRows,
    batchLookup,
    workspaceMatches,
    onWorkspaceMatchesChange,
  ]);

  // Auto-trigger email lookup on mount
  useEffect(() => {
    if (lookupCol && !lookupDone) {
      void runEmailLookup();
    } else if (!lookupCol) {
      setLookupDone(true);
      setPhase("search");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 2: Search unmatched ──
  const wsSearch = useAction(searchWorkspaceUsersAction);

  const runSearch = useCallback(async () => {
    if (searchLoading || searchColumnKeys.length === 0) return;
    setSearchLoading(true);

    const previewRows = unmatchedIndices.slice(0, 10);
    const newResults: typeof searchResults = {};

    await Promise.all(
      previewRows.map(async (rowIdx) => {
        const row = csvRows[rowIdx]!;
        const query = buildWorkspaceQuery(row, searchColumnKeys);
        if (!query) return;
        const result = await wsSearch.executeAsync({ query });
        const users = result?.data?.users ?? [];
        newResults[`${rowIdx}`] = users[0] ?? null;
      }),
    );

    setSearchResults(newResults);
    setSearchLoading(false);
  }, [searchLoading, searchColumnKeys, unmatchedIndices, csvRows, wsSearch]);

  // Re-search when columns change (debounced)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [prevSearchKey, setPrevSearchKey] = useState("");
  useEffect(() => {
    if (phase !== "search") return;
    const key = searchColumnKeys.join(",");
    if (key === prevSearchKey || key === "") return;
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPrevSearchKey(key);
      void runSearch();
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchColumnKeys, phase]);

  const confirmSearchMatch = useCallback(
    (rowIdx: number) => {
      const result = searchResults[`${rowIdx}`];
      if (!result) return;
      const newMatches = new Map(workspaceMatches);
      newMatches.set(rowIdx, {
        workspaceUserId: result.id,
        workspaceUserEmail: result.primaryEmail,
        fullName: result.fullName,
        source: "search",
      });
      onWorkspaceMatchesChange(newMatches);
    },
    [searchResults, workspaceMatches, onWorkspaceMatchesChange],
  );

  // ── Phase 3: Provision ──
  const batchSuggest = useAction(batchSuggestWorkspaceEmailsAction);
  const createAccount = useAction(createWorkspaceAccountAction);

  const loadSuggestions = useCallback(async () => {
    const rows = unmatchedIndices.map((i) => ({
      firstName: (csvRows[i]![firstNameCol ?? ""] ?? "").trim(),
      lastName: (csvRows[i]![lastNameCol ?? ""] ?? "").trim(),
    }));

    const result = await batchSuggest.executeAsync({ rows });
    if (result?.data?.suggestions) {
      setSuggestions(result.data.suggestions);
      const sel = new Set<number>();
      const edited: Record<number, string> = {};
      unmatchedIndices.forEach((idx, i) => {
        sel.add(idx);
        edited[idx] = result.data!.suggestions[i] ?? "";
      });
      setProvisionSelection(sel);
      setEditedEmails(edited);
    }
  }, [unmatchedIndices, csvRows, firstNameCol, lastNameCol, batchSuggest]);

  useEffect(() => {
    if (phase === "provision") {
      if (suggestions.length === 0 && unmatchedIndices.length > 0) {
        void loadSuggestions();
      }
      // Pre-compute per-row field values from auto-fill sources
      if (provisionFields.length > 0) {
        const newMap = new Map<number, WorkspaceFieldValues>();
        for (const rowIdx of unmatchedIndices) {
          const row = csvRows[rowIdx];
          if (!row) continue;
          const resolved = resolveRowFieldValues(
            row,
            provisionFields,
            columnMappings,
            groupAssignment,
            groupsById,
            orgUnitCategoryId,
          );
          if (Object.keys(resolved).length > 0) {
            newMap.set(rowIdx, {
              ...(perRowExtraFields.get(rowIdx) ?? {}),
              ...resolved,
            });
          }
        }
        if (newMap.size > 0) {
          setPerRowExtraFields((prev) => {
            const next = new Map(prev);
            for (const [k, v] of newMap) {
              if (!prev.has(k)) next.set(k, v);
            }
            return next;
          });
          setExpandedRows((prev) => {
            const next = new Set(prev);
            for (const k of newMap.keys()) next.add(k);
            return next;
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const provisionSelected = useCallback(async () => {
    const toProvision = unmatchedIndices.filter((i) =>
      provisionSelection.has(i),
    );

    for (const rowIdx of toProvision) {
      setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "loading" }));

      const firstName = (csvRows[rowIdx]![firstNameCol ?? ""] ?? "").trim();
      const lastName = (csvRows[rowIdx]![lastNameCol ?? ""] ?? "").trim();
      const primaryEmail = editedEmails[rowIdx] ?? "";

      if (!primaryEmail) {
        setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
        setProvisionErrors((prev) => ({
          ...prev,
          [rowIdx]: "No email address",
        }));
        continue;
      }

      const rowExtraFields = perRowExtraFields.get(rowIdx) ?? {};
      const result = await createAccount.executeAsync({
        firstName,
        lastName,
        primaryEmail,
        sendWelcomeEmail,
        extraFields:
          Object.keys(rowExtraFields).length > 0 ? rowExtraFields : undefined,
      });

      if (result?.data?.success) {
        setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "success" }));
        const newMatches = new Map(workspaceMatches);
        newMatches.set(rowIdx, {
          workspaceUserId: result.data.workspaceUserId!,
          workspaceUserEmail: result.data.primaryEmail!,
          fullName: `${firstName} ${lastName}`.trim(),
          source: "provisioned",
        });
        onWorkspaceMatchesChange(newMatches);
      } else {
        setProvisioningStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
        setProvisionErrors((prev) => ({
          ...prev,
          [rowIdx]: result?.data?.error ?? "Unknown error",
        }));
      }
    }
  }, [
    unmatchedIndices,
    provisionSelection,
    firstNameCol,
    lastNameCol,
    csvRows,
    editedEmails,
    sendWelcomeEmail,
    perRowExtraFields,
    createAccount,
    workspaceMatches,
    onWorkspaceMatchesChange,
  ]);

  // ── Render ──
  const matchedCount = workspaceMatches.size;
  const totalCount = csvRows.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Workspace Matching</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Link imported members to their Google Workspace accounts.
        </p>
      </div>

      {/* Summary badge */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{matchedCount}</strong> of{" "}
          <strong className="text-foreground">{totalCount}</strong> rows matched
        </span>
      </div>

      {/* Phase navigation */}
      <div className="flex gap-1">
        {lookupCol && (
          <Button
            variant={phase === "email-lookup" ? "default" : "ghost"}
            size="sm"
            className="text-xs"
            onClick={() => setPhase("email-lookup")}
          >
            1. Email Lookup
          </Button>
        )}
        <Button
          variant={phase === "search" ? "default" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setPhase("search")}
        >
          {lookupCol ? "2." : "1."} Search
        </Button>
        <Button
          variant={phase === "provision" ? "default" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setPhase("provision")}
        >
          {lookupCol ? "3." : "2."} Provision
        </Button>
      </div>

      {/* ── Phase 1: Email Lookup ── */}
      {phase === "email-lookup" && (
        <div className="flex flex-col gap-3">
          <Alert>
            <InfoIcon />
            <AlertTitle>Auto-matching by email</AlertTitle>
            <AlertDescription>
              Looking up each {workspaceEmailCol ? "workspace email" : "email"}{" "}
              in Google Workspace to find existing accounts.
            </AlertDescription>
          </Alert>

          {lookupLoading && (
            <div className="flex items-center gap-2 py-4">
              <Loader2Icon className="size-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Looking up workspace accounts…
              </span>
            </div>
          )}

          {lookupDone && (
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-3 gap-px bg-border text-xs font-medium text-muted-foreground">
                  <div className="bg-muted/60 px-3 py-2">Email</div>
                  <div className="bg-muted/60 px-3 py-2">Workspace Match</div>
                  <div className="bg-muted/60 px-3 py-2">Status</div>
                </div>
                <div className="max-h-60 divide-y overflow-auto">
                  {csvRows.slice(0, 20).map((row, i) => {
                    const email = lookupCol
                      ? (row[lookupCol] ?? "").trim()
                      : "";
                    const match = workspaceMatches.get(i);
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-3 items-center gap-px"
                      >
                        <div className="bg-background px-3 py-2 text-xs">
                          {email || "—"}
                        </div>
                        <div className="bg-background px-3 py-2 text-xs">
                          {match ? (
                            <span className="font-medium">
                              {match.fullName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="bg-background px-3 py-2">
                          {match ? (
                            <Badge
                              variant="outline"
                              className="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
                            >
                              Matched
                            </Badge>
                          ) : email ? (
                            <Badge variant="outline" className="text-xs">
                              Not found
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No email
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {unmatchedIndices.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setPhase("search")}
                  className="self-start"
                >
                  <SearchIcon data-icon="inline-start" />
                  Search remaining {unmatchedIndices.length} unmatched
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Phase 2: Search ── */}
      {phase === "search" && (
        <div className="flex flex-col gap-4">
          <Alert>
            <InfoIcon />
            <AlertTitle>Search by name or other attributes</AlertTitle>
            <AlertDescription>
              Select CSV columns to build a search query for unmatched rows.
              Results are matched against the Google Workspace directory.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-3">
            {csvHeaders.map((h) => (
              <label
                key={h}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5"
              >
                <Checkbox
                  checked={searchColumnKeys.includes(h)}
                  onCheckedChange={(checked) => {
                    setSearchColumnKeys((prev) =>
                      checked ? [...prev, h] : prev.filter((k) => k !== h),
                    );
                  }}
                />
                <span className="font-mono text-xs">{h}</span>
              </label>
            ))}
          </div>

          {searchColumnKeys.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Results (first {Math.min(10, unmatchedIndices.length)}{" "}
                unmatched)
              </p>
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-px bg-border text-xs font-medium text-muted-foreground">
                  <div className="bg-muted/60 px-3 py-2">Query</div>
                  <div className="bg-muted/60 px-3 py-2">Best match</div>
                  <div className="bg-muted/60 px-3 py-2">Action</div>
                </div>
                <div className="divide-y">
                  {unmatchedIndices.slice(0, 10).map((rowIdx) => {
                    const row = csvRows[rowIdx]!;
                    const query = buildWorkspaceQuery(row, searchColumnKeys);
                    const result = searchResults[`${rowIdx}`];
                    const alreadyMatched = workspaceMatches.has(rowIdx);

                    return (
                      <div
                        key={rowIdx}
                        className="grid grid-cols-[1fr_1fr_auto] items-center gap-px"
                      >
                        <div className="bg-background px-3 py-2">
                          <code className="text-xs">{query || "—"}</code>
                        </div>
                        <div className="bg-background px-3 py-2">
                          {searchLoading ? (
                            <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                          ) : result === undefined ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : result === null ? (
                            <span className="text-xs text-destructive">
                              No match
                            </span>
                          ) : (
                            <div className="text-xs">
                              <span className="font-medium">
                                {result.fullName}
                              </span>
                              <br />
                              <span className="text-muted-foreground">
                                {result.primaryEmail}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="bg-background px-3 py-2">
                          {alreadyMatched ? (
                            <Badge
                              variant="outline"
                              className="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
                            >
                              Confirmed
                            </Badge>
                          ) : result ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => confirmSearchMatch(rowIdx)}
                            >
                              Confirm
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {unmatchedIndices.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPhase("provision")}
                  className="self-start"
                >
                  <UserPlusIcon data-icon="inline-start" />
                  Provision accounts for unmatched
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Phase 3: Provision ── */}
      {phase === "provision" && (
        <div className="flex flex-col gap-4">
          <Alert>
            <InfoIcon />
            <AlertTitle>Create workspace accounts</AlertTitle>
            <AlertDescription>
              Create Google Workspace accounts for members that couldn&apos;t be
              matched. Suggested emails are generated from the organization
              template.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <Switch
              checked={sendWelcomeEmail}
              onCheckedChange={setSendWelcomeEmail}
            />
            <div>
              <p className="text-sm font-medium">Send welcome email</p>
              <p className="text-xs text-muted-foreground">
                Send each new account a welcome email with temporary password
              </p>
            </div>
          </div>

          {/* Per-row field values are shown inline in the table below */}

          {unmatchedIndices.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2 dark:bg-green-950/30">
              <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">
                All rows are matched!
              </span>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border">
                <div
                  className={`grid gap-px bg-border text-xs font-medium text-muted-foreground ${provisionFields.length > 0 ? "grid-cols-[auto_auto_1fr_1fr_auto]" : "grid-cols-[auto_1fr_1fr_auto]"}`}
                >
                  {provisionFields.length > 0 ? (
                    <div className="bg-muted/60 px-2 py-2" />
                  ) : null}
                  <div className="bg-muted/60 px-3 py-2">Select</div>
                  <div className="bg-muted/60 px-3 py-2">Name</div>
                  <div className="bg-muted/60 px-3 py-2">Email to create</div>
                  <div className="bg-muted/60 px-3 py-2">Status</div>
                </div>
                <div className="max-h-80 divide-y overflow-auto">
                  {unmatchedIndices.map((rowIdx, i) => {
                    const firstName = (
                      csvRows[rowIdx]![firstNameCol ?? ""] ?? ""
                    ).trim();
                    const lastName = (
                      csvRows[rowIdx]![lastNameCol ?? ""] ?? ""
                    ).trim();
                    const status = provisioningStatus[rowIdx];
                    const isExpanded = expandedRows.has(rowIdx);
                    const rowFields = perRowExtraFields.get(rowIdx) ?? {};
                    const manualFields = provisionFields.filter(
                      (f) => !f.source || f.source.type === "manual",
                    );
                    const requiredMissing = provisionFields.some(
                      (f) =>
                        f.required &&
                        f.type !== "boolean" &&
                        !(rowFields[f.fieldKey] ?? ""),
                    );
                    const filledCount = provisionFields.filter(
                      (f) => {
                        const v = rowFields[f.fieldKey];
                        return f.type === "boolean" ? v === true : !!v;
                      },
                    ).length;

                    return (
                      <div key={rowIdx} className="flex flex-col">
                        <div
                          className={`grid items-center gap-px ${provisionFields.length > 0 ? "grid-cols-[auto_auto_1fr_1fr_auto]" : "grid-cols-[auto_1fr_1fr_auto]"}`}
                        >
                          {provisionFields.length > 0 ? (
                            <button
                              type="button"
                              className="flex items-center justify-center bg-background px-2 py-2 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setExpandedRows((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(rowIdx)) next.delete(rowIdx);
                                  else next.add(rowIdx);
                                  return next;
                                })
                              }
                              aria-label={
                                isExpanded ? "Collapse" : "Expand fields"
                              }
                            >
                              <span
                                className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              >
                                ▶
                              </span>
                              {!isExpanded && requiredMissing ? (
                                <span className="ml-1 size-1.5 rounded-full bg-destructive" />
                              ) : null}
                              {!isExpanded && filledCount > 0 ? (
                                <span className="ml-1 text-[9px] tabular-nums text-muted-foreground">
                                  {filledCount}/{provisionFields.length}
                                </span>
                              ) : null}
                            </button>
                          ) : null}
                          <div className="bg-background px-3 py-2">
                            <Checkbox
                              checked={provisionSelection.has(rowIdx)}
                              disabled={
                                status === "loading" || status === "success"
                              }
                              onCheckedChange={(checked) => {
                                setProvisionSelection((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(rowIdx);
                                  else next.delete(rowIdx);
                                  return next;
                                });
                              }}
                            />
                          </div>
                          <div className="bg-background px-3 py-2 text-xs">
                            {firstName} {lastName}
                          </div>
                          <div className="bg-background px-1 py-1">
                            <Input
                              className="h-7 text-xs"
                              value={
                                editedEmails[rowIdx] ?? suggestions[i] ?? ""
                              }
                              disabled={
                                status === "loading" || status === "success"
                              }
                              onChange={(e) =>
                                setEditedEmails((prev) => ({
                                  ...prev,
                                  [rowIdx]: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="bg-background px-3 py-2">
                            {status === "loading" ? (
                              <Loader2Icon className="size-3 animate-spin text-primary" />
                            ) : status === "success" ? (
                              <Badge
                                variant="outline"
                                className="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
                              >
                                Created
                              </Badge>
                            ) : status === "error" ? (
                              <Badge variant="destructive" className="text-xs">
                                {provisionErrors[rowIdx] ?? "Error"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Ready
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded field values */}
                        {isExpanded && provisionFields.length > 0 ? (
                          <div className="border-t bg-muted/20 px-4 py-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {provisionFields.map((field) => {
                                const isAuto =
                                  field.source &&
                                  field.source.type !== "manual";
                                const val = rowFields[field.fieldKey];
                                return (
                                  <div
                                    key={field.fieldKey}
                                    className="flex flex-col gap-1"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <label className="text-[11px] font-medium">
                                        {field.label}
                                        {field.required ? " *" : ""}
                                      </label>
                                      {isAuto &&
                                      val !== undefined &&
                                      val !== "" ? (
                                        <span className="rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                                          auto
                                        </span>
                                      ) : null}
                                    </div>
                                    {field.type === "boolean" ? (
                                      <Switch
                                        checked={
                                          typeof val === "boolean" ? val : false
                                        }
                                        onCheckedChange={(checked) =>
                                          setPerRowExtraFields((prev) => {
                                            const next = new Map(prev);
                                            next.set(rowIdx, {
                                              ...(prev.get(rowIdx) ?? {}),
                                              [field.fieldKey]: checked,
                                            });
                                            return next;
                                          })
                                        }
                                      />
                                    ) : (
                                      <Input
                                        className={`h-7 ${field.required && !val ? "border-destructive" : ""}`}
                                        type={
                                          field.type === "email"
                                            ? "email"
                                            : field.type === "phone"
                                              ? "tel"
                                              : "text"
                                        }
                                        value={
                                          typeof val === "string" ? val : ""
                                        }
                                        placeholder={field.placeholder}
                                        onChange={(e) =>
                                          setPerRowExtraFields((prev) => {
                                            const next = new Map(prev);
                                            next.set(rowIdx, {
                                              ...(prev.get(rowIdx) ?? {}),
                                              [field.fieldKey]: e.target.value,
                                            });
                                            return next;
                                          })
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {manualFields.length === 0 &&
                            provisionFields.length > 0 ? (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                All values are auto-filled from member data. You
                                can override them above.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                onClick={() => void provisionSelected()}
                disabled={
                  provisionSelection.size === 0 || createAccount.isPending
                }
                className="self-start"
              >
                <UserPlusIcon data-icon="inline-start" />
                Provision {provisionSelection.size} account
                {provisionSelection.size !== 1 ? "s" : ""}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Skip button */}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={onSkip}
      >
        Skip workspace matching →
      </Button>
    </div>
  );
}
