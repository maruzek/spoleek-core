"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { AlertCircleIcon, UploadIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { importMembersAction } from "@/server/actions/member-admin";
import type { ImportMemberRow } from "@/lib/member-admin";

import { parseCsv } from "./csv-parser";
import { buildFieldOptions, normalizeForMatch } from "./helpers";
import { StepDone } from "./step-done";
import { StepGroups } from "./step-groups";
import { StepImporting } from "./step-importing";
import { StepMapFields } from "./step-map-fields";
import { StepPreview } from "./step-preview";
import { StepUpload } from "./step-upload";
import { StepWorkspaceSync } from "./step-workspace-sync";
import { WizardFooter } from "./wizard-footer";
import {
  STEP_LABELS,
  type FieldTarget,
  type GroupAssignmentConfig,
  type ImportDialogProps,
  type ImportResult,
  type ParsedRow,
  type StepGate,
  type WizardStep,
  type WorkspaceMatch,
} from "./types";

export function MemberImportDialog({
  open,
  onOpenChange,
  customFields,
  manageableGroupCategories,
  workspaceReady,
  workspaceProvisionFields,
  groupsById,
  orgUnitCategoryId,
  onDone,
}: ImportDialogProps) {
  // ── Wizard state ──
  const [activeStep, setActiveStep] = useState<WizardStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [columnMappings, setColumnMappings] = useState<
    Record<string, FieldTarget | null>
  >({});
  const [groupAssignment, setGroupAssignment] = useState<GroupAssignmentConfig>({
    mode: "none",
    fixedGroupIds: [],
    columnMapping: null,
  });
  const [workspaceMatches, setWorkspaceMatches] = useState<
    Map<number, WorkspaceMatch>
  >(new Map());
  const [importStatus, setImportStatus] = useState<"active" | "pending">(
    "active",
  );
  const [editableRows, setEditableRows] = useState<ImportMemberRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [assembledFrom, setAssembledFrom] = useState<string | null>(null);
  const [editsReset, setEditsReset] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  const fieldOptions = useMemo(
    () => buildFieldOptions(customFields, workspaceReady),
    [customFields, workspaceReady],
  );

  const emailMapped = useMemo(
    () => Object.values(columnMappings).includes("email"),
    [columnMappings],
  );

  const showWorkspaceStep = workspaceReady;

  const activeSteps = useMemo<WizardStep[]>(() => {
    const steps: WizardStep[] = ["upload", "map", "groups"];
    if (showWorkspaceStep) steps.push("workspace");
    steps.push("preview", "importing", "done");
    return steps;
  }, [showWorkspaceStep]);

  // Duplicate email detection
  const duplicateEmails = useMemo(() => {
    if (!emailMapped) return [];
    const emailCol = Object.entries(columnMappings).find(
      ([, v]) => v === "email",
    )?.[0];
    if (!emailCol) return [];
    const seen = new Map<string, number>();
    for (const row of csvRows) {
      const v = (row[emailCol] ?? "").trim().toLowerCase();
      if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, c]) => c > 1).map(([e]) => e);
  }, [csvRows, columnMappings, emailMapped]);

  // Reset on dialog open (adjusted during render rather than in an effect, so
  // the very first render after opening already reflects the reset state).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setActiveStep("upload");
      setCsvFile(null);
      setCsvHeaders([]);
      setCsvRows([]);
      setParseWarning(null);
      setColumnMappings({});
      setGroupAssignment({ mode: "none", fixedGroupIds: [], columnMapping: null });
      setWorkspaceMatches(new Map());
      setImportStatus("active");
      setEditableRows([]);
      setImportResult(null);
      setAssembledFrom(null);
      setEditsReset(false);
      setWorkspaceBusy(false);
    }
  }

  // ── File handling ──
  const handleFileAccept = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers, rows } = parseCsv(text);
        let warning: string | null = null;
        let finalRows = rows;
        if (rows.length > 500) {
          finalRows = rows.slice(0, 500);
          warning = `Your file has ${rows.length} data rows. Only the first 500 will be imported.`;
        }
        if (rows.length === 0) {
          warning = "The CSV file appears to be empty or has no data rows.";
        }
        setCsvHeaders(headers);
        setCsvRows(finalRows);
        setParseWarning(warning);

        const auto: Record<string, FieldTarget | null> = {};
        for (const h of headers) {
          const lower = normalizeForMatch(h);
          if (/first\s*name/.test(lower)) auto[h] = "first_name";
          else if (/last\s*name|surname/.test(lower)) auto[h] = "last_name";
          else if (/^email/.test(lower)) auto[h] = "email";
          else if (/^role/.test(lower)) auto[h] = "role";
          else if (/^status/.test(lower)) auto[h] = "status";
          else {
            const match = customFields.find(
              (f) =>
                normalizeForMatch(f.label) === lower ||
                normalizeForMatch(f.key) === lower,
            );
            if (match) auto[h] = `custom:${match.key}`;
            else auto[h] = null;
          }
        }
        setColumnMappings(auto);
      };
      reader.readAsText(file);
    },
    [customFields],
  );

  const handleFileRemove = useCallback(() => {
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setParseWarning(null);
  }, []);

  // ── Assemble rows for import ──
  const assembleRows = useCallback((): ImportMemberRow[] => {
    return csvRows.map((row, rowIdx) => {
      const entry: ImportMemberRow = {
        firstName: "",
        lastName: "",
        customFieldAnswers: {},
        groupIds: [],
        role: "member",
        status: importStatus,
      };

      for (const [colKey, target] of Object.entries(columnMappings)) {
        if (!target) continue;
        const val = (row[colKey] ?? "").trim();
        if (target === "first_name") entry.firstName = val;
        else if (target === "last_name") entry.lastName = val;
        else if (target === "email") entry.email = val || undefined;
        else if (target === "workspace_email")
          entry.workspaceUserEmail = val || undefined;
        else if (target === "role") {
          if (val === "leader" || val === "org_admin") entry.role = val;
        } else if (target === "status") {
          const s = val as typeof entry.status;
          if (
            ["invited", "pending", "active", "suspended", "archived"].includes(s)
          )
            entry.status = s;
        } else if (target.startsWith("custom:")) {
          const key = target.slice(7);
          entry.customFieldAnswers[key] = val;
        }
      }

      // Group assignment
      const assignedIds: string[] = [];
      if (
        groupAssignment.mode === "column" &&
        groupAssignment.columnMapping
      ) {
        const colVal = (
          row[groupAssignment.columnMapping.columnKey] ?? ""
        ).trim();
        const gid = groupAssignment.columnMapping.valueToGroupId[colVal];
        if (gid) assignedIds.push(gid);
      }
      if (groupAssignment.fixedGroupIds.length > 0) {
        for (const id of groupAssignment.fixedGroupIds) {
          if (!assignedIds.includes(id)) assignedIds.push(id);
        }
      }
      entry.groupIds = assignedIds;

      // Workspace match
      const wsMatch = workspaceMatches.get(rowIdx);
      if (wsMatch) {
        entry.workspaceUserId = wsMatch.workspaceUserId;
        entry.workspaceUserEmail = wsMatch.workspaceUserEmail;
      }

      return entry;
    });
  }, [csvRows, columnMappings, groupAssignment, importStatus, workspaceMatches]);

  // Everything upstream that feeds assembleRows(). Re-entering preview with an
  // unchanged fingerprint keeps the user's cell edits; only a real upstream
  // change discards them (and says so, via `editsReset`).
  const assemblyFingerprint = useMemo(
    () =>
      JSON.stringify([
        csvRows.length,
        columnMappings,
        groupAssignment,
        importStatus,
        [...workspaceMatches.entries()].map(([i, m]) => [
          i,
          m.workspaceUserId,
        ]),
      ]),
    [csvRows, columnMappings, groupAssignment, importStatus, workspaceMatches],
  );

  // Assemble rows synchronously the moment we enter preview, before it renders —
  // a useEffect here would run one tick too late, mounting StepPreview with
  // stale/empty data first (it only seeds its state from props once, on mount).
  if (activeStep === "preview" && assembledFrom !== assemblyFingerprint) {
    setEditableRows(assembleRows());
    setEditsReset(assembledFrom !== null);
    setAssembledFrom(assemblyFingerprint);
  }

  // ── Import action ──
  const importAction = useAction(importMembersAction, {
    onSuccess({ data }) {
      if (data) {
        setImportResult(data);
        setActiveStep("done");
      }
    },
    onError() {
      setActiveStep("preview");
    },
  });

  const triggerImport = useCallback(async () => {
    setActiveStep("importing");
    await importAction.executeAsync({ rows: editableRows });
  }, [editableRows, importAction]);

  // ── Step gates ──
  // Each step's constraints in one place; the footer reads nothing else.
  const unlinkedCount = csvRows.length - workspaceMatches.size;

  const gates = useMemo<Partial<Record<WizardStep, StepGate>>>(() => {
    const mapped = Object.values(columnMappings);
    const hasName =
      mapped.includes("first_name") || mapped.includes("last_name");

    const groupColumnUnmapped =
      groupAssignment.mode === "column" &&
      groupAssignment.columnMapping != null &&
      Object.keys(groupAssignment.columnMapping.valueToGroupId).length > 0 &&
      Object.values(groupAssignment.columnMapping.valueToGroupId).every(
        (id) => id == null,
      ) &&
      groupAssignment.fixedGroupIds.length === 0;

    return {
      upload:
        csvRows.length === 0
          ? { blocked: { reason: "Upload a CSV file to continue" } }
          : {},
      map: hasName
        ? {}
        : {
            blocked: {
              reason: "Map a First Name or Last Name column to continue",
            },
          },
      groups: groupColumnUnmapped
        ? {
            pending: {
              summary: "No group mapping set",
              detail:
                "You picked a CSV column for groups but none of its values are mapped to a Spoleek group, so no member will be added to any group.",
            },
          }
        : {},
      workspace: {
        busy: workspaceBusy,
        ...(unlinkedCount > 0
          ? {
              pending: {
                summary: `${unlinkedCount} row${unlinkedCount !== 1 ? "s" : ""} have no Workspace account`,
                detail:
                  "They will be imported as members without a linked Google account. You can link them later from the member list.",
              },
            }
          : {}),
      },
    };
  }, [
    csvRows,
    columnMappings,
    groupAssignment,
    workspaceBusy,
    unlinkedCount,
  ]);

  const activeGate = gates[activeStep] ?? {};

  // ── Step navigation ──
  const goToStep = useCallback(
    (next: WizardStep) => {
      if (
        activeSteps.indexOf(next) > activeSteps.indexOf(activeStep) &&
        gates[activeStep]?.blocked
      )
        return;
      setActiveStep(next);
    },
    [activeStep, activeSteps, gates],
  );

  const goNext = useCallback(() => {
    const idx = activeSteps.indexOf(activeStep);
    if (idx < activeSteps.length - 1) goToStep(activeSteps[idx + 1]!);
  }, [activeStep, activeSteps, goToStep]);

  const goPrev = useCallback(() => {
    const idx = activeSteps.indexOf(activeStep);
    if (idx > 0) setActiveStep(activeSteps[idx - 1]!);
  }, [activeStep, activeSteps]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-3/5 min-w-2/5 flex-col gap-0 overflow-hidden p-0 sm:max-w-3/5"
        onInteractOutside={(e) => {
          if (activeStep === "importing") {
            e.preventDefault();
            return;
          }
          if (
            e.target instanceof Element &&
            e.target.closest('[data-slot="popover-content"]')
          )
            e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (activeStep === "importing") e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest('[data-slot="popover-content"]')
          )
            e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <UploadIcon className="size-4 text-muted-foreground" />
            Import Members from CSV
          </DialogTitle>
        </DialogHeader>

        {/* Stepper header */}
        <div className="shrink-0 border-b px-6 py-3">
          {/* `importing` and `done` are not rendered as steps, so the stepper
              is parked on the last visible one rather than losing its place. */}
          <Stepper
            value={
              activeStep === "importing" || activeStep === "done"
                ? "preview"
                : activeStep
            }
            nonInteractive
            className="gap-0"
          >
            <StepperList className="gap-1">
              {activeSteps
                .filter((s) => s !== "importing" && s !== "done")
                .map((step, idx, arr) => (
                  // No `completed` prop on purpose: StepperItem re-registers
                  // itself whenever `completed` changes, and registration is a
                  // Map.set that moves the step to the end of the insertion
                  // order. That scrambles every index the stepper derives —
                  // indicator numbers and which separator counts as last.
                  // getDataState already marks earlier steps completed from
                  // the active value alone, so the prop is redundant here.
                  <StepperItem key={step} value={step} className="shrink">
                    <StepperTrigger className="flex items-center gap-1.5 px-2 py-1">
                      <StepperIndicator className="size-5 rounded-full text-[10px]" />
                      <StepperTitle className="hidden text-xs sm:block">
                        {STEP_LABELS[step]}
                      </StepperTitle>
                    </StepperTrigger>
                    {idx < arr.length - 1 && (
                      <StepperSeparator className="mx-1 h-px flex-1 bg-border" />
                    )}
                  </StepperItem>
                ))}
            </StepperList>
          </Stepper>
        </div>

        {/* Step content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            {activeStep === "upload" && (
              <StepUpload
                csvFile={csvFile}
                csvRows={csvRows}
                csvHeaders={csvHeaders}
                parseWarning={parseWarning}
                onFileAccept={handleFileAccept}
                onFileRemove={handleFileRemove}
              />
            )}

            {activeStep === "map" && (
              <StepMapFields
                csvHeaders={csvHeaders}
                csvRows={csvRows}
                columnMappings={columnMappings}
                fieldOptions={fieldOptions}
                onMappingChange={(header, value) =>
                  setColumnMappings((prev) => ({ ...prev, [header]: value }))
                }
              />
            )}

            {activeStep === "groups" && (
              <StepGroups
                csvHeaders={csvHeaders}
                csvRows={csvRows}
                groupAssignment={groupAssignment}
                manageableGroupCategories={manageableGroupCategories}
                onGroupAssignmentChange={setGroupAssignment}
              />
            )}

            {activeStep === "workspace" && (
              <StepWorkspaceSync
                csvHeaders={csvHeaders}
                csvRows={csvRows}
                columnMappings={columnMappings}
                groupAssignment={groupAssignment}
                workspaceMatches={workspaceMatches}
                onWorkspaceMatchesChange={setWorkspaceMatches}
                onBusyChange={setWorkspaceBusy}
                provisionFields={workspaceProvisionFields}
                groupsById={groupsById}
                orgUnitCategoryId={orgUnitCategoryId}
              />
            )}

            {activeStep === "preview" && (
              <StepPreview
                editableRows={editableRows}
                onRowsChange={setEditableRows}
                importStatus={importStatus}
                onImportStatusChange={setImportStatus}
                duplicateEmails={duplicateEmails}
                editsReset={editsReset}
              />
            )}

            {activeStep === "importing" && (
              <StepImporting rowCount={editableRows.length} />
            )}

            {activeStep === "done" && importResult && (
              <StepDone result={importResult} />
            )}

            {importAction.result.serverError && activeStep !== "importing" && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircleIcon />
                <AlertTitle>Import failed</AlertTitle>
                <AlertDescription>
                  {importAction.result.serverError}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Footer nav */}
        {activeStep === "done" ? (
          <div className="flex shrink-0 justify-end border-t px-6 py-4">
            <Button
              onClick={() => {
                onOpenChange(false);
                onDone();
              }}
            >
              Close &amp; Refresh
            </Button>
          </div>
        ) : activeStep === "importing" ? (
          <div className="shrink-0 border-t px-6 py-4" />
        ) : activeStep === "preview" ? (
          <WizardFooter
            gate={{ busy: importAction.isPending }}
            nextLabel={
              importAction.isPending
                ? "Importing…"
                : `Import ${editableRows.length} member${editableRows.length !== 1 ? "s" : ""}`
            }
            nextIcon={
              importAction.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )
            }
            onBack={goPrev}
            backDisabled={false}
            onNext={() => void triggerImport()}
          />
        ) : (
          <WizardFooter
            gate={activeGate}
            nextLabel="Continue"
            onBack={goPrev}
            backDisabled={activeStep === "upload"}
            onNext={goNext}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
