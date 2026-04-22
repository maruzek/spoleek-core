"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  InfoIcon,
  Loader2Icon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperNext,
  StepperPrev,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MemberGroupAssignmentField } from "@/components/app/member-group-assignment-field";
import {
  importMembersAction,
  searchWorkspaceUsersAction,
} from "@/server/actions/member-admin";
import type { MemberCustomField } from "@/server/db/schema";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";

// ─── Types ───────────────────────────────────────────────────────────────────

type ParsedRow = Record<string, string>;

type BuiltinFieldKey =
  | "first_name"
  | "last_name"
  | "email"
  | "workspace_email"
  | "role"
  | "status";

type FieldTarget = BuiltinFieldKey | `custom:${string}`;

type GroupAssignmentMode = "none" | "fixed" | "column";

interface GroupColumnMapping {
  // unique values found in the chosen column → group ID (or null = unmatched)
  valueToGroupId: Record<string, string | null>;
  columnKey: string;
}

interface GroupAssignmentConfig {
  mode: GroupAssignmentMode;
  fixedGroupIds: string[];
  columnMapping: GroupColumnMapping | null;
}

type WsSearchResult = {
  id: string;
  primaryEmail: string;
  fullName: string;
} | null;

type WizardStep =
  | "upload"
  | "map"
  | "groups"
  | "workspace"
  | "preview"
  | "importing"
  | "done";

const STEP_IDS: WizardStep[] = [
  "upload",
  "map",
  "groups",
  "workspace",
  "preview",
  "importing",
  "done",
];

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  map: "Map Fields",
  groups: "Groups",
  workspace: "Workspace",
  preview: "Preview",
  importing: "Import",
  done: "Done",
};

// ─── CSV Parser (no dependencies) ────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers: string[] = [];
  const rows: ParsedRow[] = [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  let firstNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").trim()) {
      firstNonEmpty = i;
      break;
    }
  }
  if (firstNonEmpty === -1) return { headers: [], rows: [] };

  const headerLine = parseLine(lines[firstNonEmpty]!);
  headers.push(...headerLine.filter(Boolean));

  for (let i = firstNonEmpty + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const values = parseLine(line);
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFieldOptions(
  customFields: MemberCustomField[],
  workspaceReady: boolean,
) {
  const builtins: { value: FieldTarget; label: string }[] = [
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "email", label: "Email" },
  ];

  if (workspaceReady) {
    builtins.push({
      value: "workspace_email",
      label: "Workspace Email",
    });
  }

  builtins.push(
    { value: "role", label: "Role" },
    { value: "status", label: "Status" },
  );

  const customs: { value: FieldTarget; label: string }[] = customFields.map(
    (f) => ({
      value: `custom:${f.key}` as FieldTarget,
      label: f.label,
    }),
  );

  return [...builtins, ...customs];
}

function buildWorkspaceQuery(row: ParsedRow, columnKeys: string[]): string {
  const parts: string[] = [];
  for (const key of columnKeys) {
    const val = (row[key] ?? "").trim();
    if (val) parts.push(val);
  }
  return parts.join(" ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldMappingCombobox({
  columnHeader,
  value,
  options,
  onChange,
}: {
  columnHeader: string;
  value: FieldTarget | null;
  options: { value: FieldTarget; label: string }[];
  onChange: (v: FieldTarget | null) => void;
}) {
  const selectedItem = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Combobox
      items={options}
      value={selectedItem}
      onValueChange={(item) => {
        onChange(item ? (item as typeof selectedItem)!.value : null);
      }}
    >
      {/* <ComboboxTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between bg-transparent px-3 font-normal shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <ComboboxValue placeholder="Select mapping…" />
          </Button>
        }
      /> */}
      <ComboboxInput placeholder="Search mappings…" showClear />
      <ComboboxContent>
        <ComboboxEmpty>No match.</ComboboxEmpty>
        <ComboboxList>
          {(item: (typeof options)[number]) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MemberImportDialog({
  open,
  onOpenChange,
  customFields,
  manageableGroupCategories,
  workspaceReady,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFields: MemberCustomField[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  workspaceReady: boolean;
  onDone: () => void;
}) {
  // ── Wizard state ──
  const [activeStep, setActiveStep] = useState<WizardStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [columnMappings, setColumnMappings] = useState<
    Record<string, FieldTarget | null>
  >({});
  const [groupAssignment, setGroupAssignment] = useState<GroupAssignmentConfig>(
    {
      mode: "none",
      fixedGroupIds: [],
      columnMapping: null,
    },
  );
  const [wsColumnKeys, setWsColumnKeys] = useState<string[]>([]);
  const wsResultCacheRef = useRef<Record<string, WsSearchResult>>({});
  const [wsResults, setWsResults] = useState<Record<string, WsSearchResult>>(
    {},
  );
  const [wsSearching, setWsSearching] = useState(false);
  const [importStatus, setImportStatus] = useState<"active" | "pending">(
    "active",
  );
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const fieldOptions = useMemo(
    () => buildFieldOptions(customFields, workspaceReady),
    [customFields, workspaceReady],
  );

  const emailMapped = useMemo(
    () => Object.values(columnMappings).includes("email"),
    [columnMappings],
  );

  const showWorkspaceStep = workspaceReady && !emailMapped;

  // Active steps depend on whether workspace step is shown
  const activeSteps = useMemo<WizardStep[]>(() => {
    const steps: WizardStep[] = ["upload", "map", "groups"];
    if (showWorkspaceStep) steps.push("workspace");
    steps.push("preview", "importing", "done");
    return steps;
  }, [showWorkspaceStep]);

  // Compute duplicate emails in CSV
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

  // Reset everything when dialog opens
  useEffect(() => {
    if (!open) return;
    setActiveStep("upload");
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setParseWarning(null);
    setColumnMappings({});
    setGroupAssignment({
      mode: "none",
      fixedGroupIds: [],
      columnMapping: null,
    });
    setWsColumnKeys([]);
    wsResultCacheRef.current = {};
    setWsResults({});
    setImportStatus("active");
    setImportResult(null);
  }, [open]);

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
        // Auto-map: try to match headers to known fields
        const auto: Record<string, FieldTarget | null> = {};
        for (const h of headers) {
          const lower = h.toLowerCase().trim();
          if (/first\s*name/.test(lower)) auto[h] = "first_name";
          else if (/last\s*name|surname/.test(lower)) auto[h] = "last_name";
          else if (/^email/.test(lower)) auto[h] = "email";
          else if (/^role/.test(lower)) auto[h] = "role";
          else if (/^status/.test(lower)) auto[h] = "status";
          else {
            // Try to match custom field by label or key
            const match = customFields.find(
              (f) => f.label.toLowerCase() === lower || f.key === lower,
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

  // ── Workspace search (batch, cached) ──
  const wsSearchAction = useAction(searchWorkspaceUsersAction);

  const triggerWsSearch = useCallback(async () => {
    if (wsSearching || wsColumnKeys.length === 0) return;
    const previewRows = csvRows.slice(0, 5);
    const newResults: Record<string, WsSearchResult> = {
      ...wsResultCacheRef.current,
    };
    const toFetch: { rowIdx: number; query: string }[] = [];

    for (let i = 0; i < previewRows.length; i++) {
      const row = previewRows[i]!;
      const query = buildWorkspaceQuery(row, wsColumnKeys);
      if (!query) continue;
      if (wsResultCacheRef.current[query] !== undefined) continue;
      toFetch.push({ rowIdx: i, query });
    }

    if (toFetch.length === 0) {
      setWsResults(newResults);
      return;
    }

    setWsSearching(true);
    await Promise.all(
      toFetch.map(async ({ query }) => {
        const result = await wsSearchAction.executeAsync({ query });
        const users = result?.data?.users ?? [];
        newResults[query] = users[0] ?? null;
        wsResultCacheRef.current[query] = users[0] ?? null;
      }),
    );
    setWsResults({ ...newResults });
    setWsSearching(false);
  }, [csvRows, wsColumnKeys, wsSearchAction, wsSearching]);

  // Load WS results when entering workspace step
  useEffect(() => {
    if (activeStep === "workspace") {
      void triggerWsSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  // Re-search when ws columns change (debounced by settled state)
  const prevWsColumnsRef = useRef<string>("");
  useEffect(() => {
    if (activeStep !== "workspace") return;
    const key = wsColumnKeys.join(",");
    if (key === prevWsColumnsRef.current) return;
    prevWsColumnsRef.current = key;
    void triggerWsSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsColumnKeys, activeStep]);

  // ── Assemble rows for import ──
  const assembleRows = useCallback(() => {
    return csvRows.map((row) => {
      const entry: {
        firstName: string;
        lastName: string;
        email?: string;
        workspaceUserId?: string;
        workspaceUserEmail?: string;
        customFieldAnswers: Record<string, unknown>;
        groupIds: string[];
        role: "member" | "leader" | "org_admin";
        status: "invited" | "pending" | "active" | "suspended" | "archived";
      } = {
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
            ["invited", "pending", "active", "suspended", "archived"].includes(
              s,
            )
          )
            entry.status = s;
        } else if (target.startsWith("custom:")) {
          const key = target.slice(7);
          entry.customFieldAnswers[key] = val;
        }
      }

      // Group assignment
      if (groupAssignment.mode === "fixed") {
        entry.groupIds = groupAssignment.fixedGroupIds;
      } else if (
        groupAssignment.mode === "column" &&
        groupAssignment.columnMapping
      ) {
        const colVal = (
          row[groupAssignment.columnMapping.columnKey] ?? ""
        ).trim();
        const gid = groupAssignment.columnMapping.valueToGroupId[colVal];
        if (gid) entry.groupIds = [gid];
      }

      // Workspace matching from preview cache
      if (showWorkspaceStep && wsColumnKeys.length > 0) {
        const query = buildWorkspaceQuery(row, wsColumnKeys);
        const match = wsResultCacheRef.current[query];
        if (match) {
          entry.workspaceUserId = match.id;
          entry.workspaceUserEmail = match.primaryEmail;
        }
      }

      return entry;
    });
  }, [
    csvRows,
    columnMappings,
    groupAssignment,
    importStatus,
    showWorkspaceStep,
    wsColumnKeys,
  ]);

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
    const rows = assembleRows();
    await importAction.executeAsync({ rows });
  }, [assembleRows, importAction]);

  // ── Step navigation helpers ──
  const canAdvanceFrom = useCallback(
    (step: WizardStep): boolean => {
      if (step === "upload") return csvRows.length > 0;
      if (step === "map") {
        const mapped = Object.values(columnMappings);
        const hasName =
          mapped.includes("first_name") || mapped.includes("last_name");
        return hasName;
      }
      return true;
    },
    [csvRows, columnMappings],
  );

  const goToStep = useCallback(
    (next: WizardStep) => {
      const current = activeStep;
      if (
        activeSteps.indexOf(next) > activeSteps.indexOf(current) &&
        !canAdvanceFrom(current)
      ) {
        return;
      }
      setActiveStep(next);
    },
    [activeStep, activeSteps, canAdvanceFrom],
  );

  const goNext = useCallback(() => {
    const idx = activeSteps.indexOf(activeStep);
    if (idx < activeSteps.length - 1) {
      const next = activeSteps[idx + 1]!;
      goToStep(next);
    }
  }, [activeStep, activeSteps, goToStep]);

  const goPrev = useCallback(() => {
    const idx = activeSteps.indexOf(activeStep);
    if (idx > 0) setActiveStep(activeSteps[idx - 1]!);
  }, [activeStep, activeSteps]);

  // ── Group column mapping helpers ──
  const columnGroups = useMemo<string[]>(() => {
    const col = groupAssignment.columnMapping?.columnKey;
    if (!col) return [];
    const vals = new Set(
      csvRows.map((r) => (r[col] ?? "").trim()).filter(Boolean),
    );
    return [...vals];
  }, [csvRows, groupAssignment.columnMapping]);

  const allGroups = useMemo(
    () =>
      manageableGroupCategories.flatMap((c) =>
        c.groups.map((g) => ({ ...g, categoryName: c.name })),
      ),
    [manageableGroupCategories],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-3/5 min-w-2/5 flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest('[data-slot="combobox-content"]')
          ) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => {
          if (
            e.target instanceof Element &&
            e.target.closest('[data-slot="combobox-content"]')
          ) {
            e.preventDefault();
          }
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
          <Stepper value={activeStep} nonInteractive className="gap-0">
            <StepperList className="gap-1">
              {activeSteps
                .filter((s) => s !== "importing" && s !== "done")
                .map((step, idx, arr) => (
                  <StepperItem
                    key={step}
                    value={step}
                    completed={
                      activeSteps.indexOf(activeStep) >
                      activeSteps.indexOf(step)
                    }
                    className="shrink"
                  >
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
        <ScrollArea className="flex-1">
          <div className="px-6 py-5">
            {/* ── Step 1: Upload ── */}
            {activeStep === "upload" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold">Upload CSV File</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Select or drag a{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      .csv
                    </code>{" "}
                    file. The first row must contain column headers. Up to 500
                    data rows are supported.
                  </p>
                </div>

                {parseWarning && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertTriangleIcon className="text-amber-600" />
                    <AlertTitle>Note</AlertTitle>
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      {parseWarning}
                    </AlertDescription>
                  </Alert>
                )}

                <FileUpload
                  accept=".csv,text/csv"
                  maxFiles={1}
                  onAccept={handleFileAccept}
                  className="w-full"
                >
                  <FileUploadDropzone className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:bg-muted/60 data-drag-over:border-primary data-drag-over:bg-primary/5">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-primary/10 p-3">
                        <FileTextIcon className="size-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Drop your CSV here
                        </p>
                        <p className="text-xs text-muted-foreground">
                          or click to browse
                        </p>
                      </div>
                    </div>
                    <FileUploadTrigger asChild>
                      <Button variant="outline" size="sm" type="button">
                        <UploadIcon data-icon="inline-start" />
                        Browse file
                      </Button>
                    </FileUploadTrigger>
                  </FileUploadDropzone>

                  <FileUploadList className="mt-3">
                    {csvFile && (
                      <FileUploadItem value={csvFile}>
                        <FileUploadItemPreview />
                        <FileUploadItemMetadata />
                        <FileUploadItemDelete asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="ml-auto"
                            type="button"
                            onClick={() => {
                              setCsvFile(null);
                              setCsvHeaders([]);
                              setCsvRows([]);
                              setParseWarning(null);
                            }}
                          >
                            <XIcon />
                          </Button>
                        </FileUploadItemDelete>
                      </FileUploadItem>
                    )}
                  </FileUploadList>
                </FileUpload>

                {csvRows.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
                    <span className="text-sm text-muted-foreground">
                      Parsed{" "}
                      <strong className="text-foreground">
                        {csvRows.length} row{csvRows.length !== 1 ? "s" : ""}
                      </strong>{" "}
                      with{" "}
                      <strong className="text-foreground">
                        {csvHeaders.length} column
                        {csvHeaders.length !== 1 ? "s" : ""}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Field Mapping ── */}
            {activeStep === "map" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold">Map CSV Columns</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Assign each column in your file to a Spoleek field. At least
                    one name field (First Name or Last Name) must be mapped.
                  </p>
                </div>

                <div className="rounded-xl border overflow-hidden">
                  <div className="grid grid-cols-2 gap-px bg-border text-xs font-medium text-muted-foreground">
                    <div className="bg-muted/60 px-3 py-2">CSV Column</div>
                    <div className="bg-muted/60 px-3 py-2">Maps to</div>
                  </div>
                  <div className="divide-y">
                    {csvHeaders.map((header) => (
                      <div
                        key={header}
                        className="grid grid-cols-2 items-center gap-px bg-muted/10"
                      >
                        <div className="bg-background px-3 py-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {header}
                          </Badge>
                          {csvRows[0] && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              e.g. {csvRows[0][header] ?? ""}
                            </p>
                          )}
                        </div>
                        <div className="bg-background px-3 py-2">
                          <FieldMappingCombobox
                            columnHeader={header}
                            value={columnMappings[header] ?? null}
                            options={fieldOptions}
                            onChange={(v) =>
                              setColumnMappings((prev) => ({
                                ...prev,
                                [header]: v,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!Object.values(columnMappings).some(
                  (v) => v === "first_name" || v === "last_name",
                ) && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertTriangleIcon className="text-amber-600" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      Map at least one name column (First Name or Last Name) to
                      continue.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* ── Step 3: Group Assignment ── */}
            {activeStep === "groups" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-base font-semibold">Group Assignment</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Optionally assign imported members to groups. You can map a
                    CSV column to groups, assign all members to fixed groups, or
                    skip.
                  </p>
                </div>

                <ToggleGroup
                  type="single"
                  value={groupAssignment.mode}
                  onValueChange={(v) => {
                    if (v) {
                      setGroupAssignment((prev) => ({
                        ...prev,
                        mode: v as GroupAssignmentMode,
                      }));
                    }
                  }}
                  className="justify-start gap-2"
                >
                  <ToggleGroupItem value="none" className="text-xs">
                    No assignment
                  </ToggleGroupItem>
                  <ToggleGroupItem value="fixed" className="text-xs">
                    Assign all to groups
                  </ToggleGroupItem>
                  {csvHeaders.length > 0 && (
                    <ToggleGroupItem value="column" className="text-xs">
                      Map from CSV column
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>

                {groupAssignment.mode === "fixed" && (
                  <MemberGroupAssignmentField
                    categories={manageableGroupCategories}
                    groupIds={groupAssignment.fixedGroupIds}
                    description="All imported members will be added to the selected groups."
                    onChange={(ids) =>
                      setGroupAssignment((prev) => ({
                        ...prev,
                        fixedGroupIds: ids,
                      }))
                    }
                  />
                )}

                {groupAssignment.mode === "column" && (
                  <div className="flex flex-col gap-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>
                          Which column contains group names?
                        </FieldLabel>
                        <FieldContent>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            value={
                              groupAssignment.columnMapping?.columnKey ?? ""
                            }
                            onChange={(e) => {
                              const col = e.target.value;
                              if (!col) {
                                setGroupAssignment((prev) => ({
                                  ...prev,
                                  columnMapping: null,
                                }));
                                return;
                              }
                              const vals = new Set(
                                csvRows
                                  .map((r) => (r[col] ?? "").trim())
                                  .filter(Boolean),
                              );
                              const valueToGroupId: Record<
                                string,
                                string | null
                              > = {};
                              for (const v of vals) valueToGroupId[v] = null;
                              setGroupAssignment((prev) => ({
                                ...prev,
                                columnMapping: {
                                  columnKey: col,
                                  valueToGroupId,
                                },
                              }));
                            }}
                          >
                            <option value="">— select a column —</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </FieldContent>
                      </Field>
                    </FieldGroup>

                    {groupAssignment.columnMapping &&
                      columnGroups.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Map column values → groups
                          </p>
                          <div className="rounded-xl border overflow-hidden">
                            <div className="grid grid-cols-2 gap-px bg-border text-xs font-medium text-muted-foreground">
                              <div className="bg-muted/60 px-3 py-2">
                                CSV Value
                              </div>
                              <div className="bg-muted/60 px-3 py-2">
                                Spoleek Group
                              </div>
                            </div>
                            <div className="divide-y">
                              {columnGroups.map((val) => (
                                <div
                                  key={val}
                                  className="grid grid-cols-2 items-center gap-px"
                                >
                                  <div className="bg-background px-3 py-2">
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-xs"
                                    >
                                      {val}
                                    </Badge>
                                  </div>
                                  <div className="bg-background px-3 py-2">
                                    <select
                                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-0.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                      value={
                                        groupAssignment.columnMapping
                                          ?.valueToGroupId[val] ?? ""
                                      }
                                      onChange={(e) => {
                                        setGroupAssignment((prev) => ({
                                          ...prev,
                                          columnMapping: prev.columnMapping
                                            ? {
                                                ...prev.columnMapping,
                                                valueToGroupId: {
                                                  ...prev.columnMapping
                                                    .valueToGroupId,
                                                  [val]: e.target.value || null,
                                                },
                                              }
                                            : null,
                                        }));
                                      }}
                                    >
                                      <option value="">— ignore —</option>
                                      {allGroups.map((g) => (
                                        <option key={g.id} value={g.id}>
                                          {g.categoryName} / {g.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Workspace Sync ── */}
            {activeStep === "workspace" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold">
                    Workspace Matching
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    No email column was mapped, so we can search your Google
                    Workspace directory to link accounts.
                  </p>
                </div>

                <Alert>
                  <InfoIcon />
                  <AlertTitle>How workspace search works</AlertTitle>
                  <AlertDescription>
                    We query the Google Workspace directory using the column
                    values you select below. For example, selecting "First Name"
                    and "Last Name" builds a query like{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      givenName:Anna familyName:Novak
                    </code>
                    . The best match is used to link the member&apos;s workspace
                    account. If no match is found, the member is imported
                    without a workspace link.
                  </AlertDescription>
                </Alert>

                <FieldGroup>
                  <FieldLabel className="text-sm font-medium">
                    Columns to include in search query
                  </FieldLabel>
                  <FieldDescription>
                    Select which CSV column values are combined into the
                    workspace search query.
                  </FieldDescription>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {csvHeaders.map((h) => (
                      <label
                        key={h}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5"
                      >
                        <Checkbox
                          checked={wsColumnKeys.includes(h)}
                          onCheckedChange={(checked) => {
                            setWsColumnKeys((prev) =>
                              checked
                                ? [...prev, h]
                                : prev.filter((k) => k !== h),
                            );
                          }}
                        />
                        <span className="font-mono text-xs">{h}</span>
                      </label>
                    ))}
                  </div>
                </FieldGroup>

                {wsColumnKeys.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Live preview (first 5 rows)
                    </p>
                    <div className="rounded-xl border overflow-hidden">
                      <div className="grid grid-cols-2 gap-px bg-border text-xs font-medium text-muted-foreground">
                        <div className="bg-muted/60 px-3 py-2">Query</div>
                        <div className="bg-muted/60 px-3 py-2">Best match</div>
                      </div>
                      <div className="divide-y">
                        {csvRows.slice(0, 5).map((row, i) => {
                          const query = buildWorkspaceQuery(row, wsColumnKeys);
                          const result = wsResults[query];
                          return (
                            <div
                              key={i}
                              className="grid grid-cols-2 items-center gap-px"
                            >
                              <div className="bg-background px-3 py-2">
                                <code className="text-xs text-foreground">
                                  {query || (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </code>
                              </div>
                              <div className="bg-background px-3 py-2">
                                {wsSearching ? (
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start text-muted-foreground"
                  onClick={goNext}
                >
                  Skip workspace matching →
                </Button>
              </div>
            )}

            {/* ── Step 5: Preview ── */}
            {activeStep === "preview" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold">Review & Confirm</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Check the import summary before proceeding.
                  </p>
                </div>

                <Alert>
                  <InfoIcon />
                  <AlertTitle>Additive import only</AlertTitle>
                  <AlertDescription>
                    This import will never delete members. Existing members
                    matched by email address will be <strong>updated</strong>{" "}
                    with the new data. All other rows will create new member
                    records.
                  </AlertDescription>
                </Alert>

                {duplicateEmails.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertTriangleIcon className="text-amber-600" />
                    <AlertTitle>Duplicate emails detected</AlertTitle>
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      The following email addresses appear more than once in the
                      CSV. The last row for each will be used:{" "}
                      <span className="font-mono text-xs">
                        {duplicateEmails.join(", ")}
                      </span>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      Default status for new members
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Unless overridden by a mapped &quot;Status&quot; column
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Pending
                    </span>
                    <Switch
                      checked={importStatus === "active"}
                      onCheckedChange={(checked) =>
                        setImportStatus(checked ? "active" : "pending")
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      Active
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
                  <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">
                    <strong>{csvRows.length}</strong> row
                    {csvRows.length !== 1 ? "s" : ""} will be imported with
                    status{" "}
                    <Badge
                      variant={
                        importStatus === "active" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {importStatus}
                    </Badge>
                  </span>
                </div>

                {/* Mini preview table */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Preview (first 5 rows)
                  </p>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 text-muted-foreground">
                          {csvHeaders
                            .filter((h) => columnMappings[h] != null)
                            .slice(0, 6)
                            .map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2 text-left font-medium"
                              >
                                {h}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {csvRows.slice(0, 5).map((row, i) => (
                          <tr
                            key={i}
                            className="bg-background hover:bg-muted/20"
                          >
                            {csvHeaders
                              .filter((h) => columnMappings[h] != null)
                              .slice(0, 6)
                              .map((h) => (
                                <td
                                  key={h}
                                  className="max-w-40 truncate px-3 py-2 text-foreground"
                                >
                                  {row[h] ?? ""}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvRows.length > 5 && (
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                        …and {csvRows.length - 5} more rows
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 6: Importing ── */}
            {activeStep === "importing" && (
              <div className="flex min-h-48 flex-col items-center justify-center gap-4">
                <Loader2Icon className="size-10 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-base font-semibold">Importing members…</p>
                  <p className="text-sm text-muted-foreground">
                    Processing {csvRows.length} row
                    {csvRows.length !== 1 ? "s" : ""}. This may take a moment.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 7: Done ── */}
            {activeStep === "done" && importResult && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
                    <CheckCircle2Icon className="size-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Import complete</h2>
                    <p className="text-sm text-muted-foreground">
                      Your CSV has been processed.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Created",
                      value: importResult.created,
                      color: "text-green-600 dark:text-green-400",
                    },
                    {
                      label: "Updated",
                      value: importResult.updated,
                      color: "text-blue-600 dark:text-blue-400",
                    },
                    {
                      label: "Skipped",
                      value: importResult.skipped,
                      color: "text-amber-600 dark:text-amber-400",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1 rounded-xl border bg-muted/30 px-4 py-3"
                    >
                      <span
                        className={`text-2xl font-bold tabular-nums ${color}`}
                      >
                        {value}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                {importResult.errors.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>
                        {importResult.errors.length} row
                        {importResult.errors.length !== 1 ? "s" : ""} had errors
                      </AlertTitle>
                      <AlertDescription>
                        These rows were skipped. Review the details below.
                      </AlertDescription>
                    </Alert>
                    <ScrollArea className="max-h-40 rounded-lg border">
                      <div className="divide-y text-xs">
                        {importResult.errors.map(({ row, message }) => (
                          <div
                            key={row}
                            className="flex items-start gap-3 px-3 py-2"
                          >
                            <Badge
                              variant="outline"
                              className="shrink-0 font-mono"
                            >
                              Row {row}
                            </Badge>
                            <span className="text-muted-foreground">
                              {message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {/* Server error on import */}
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
        </ScrollArea>

        {/* Footer nav */}
        <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
          {activeStep === "done" ? (
            <div className="flex w-full justify-end">
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
            <div className="w-full" />
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={goPrev}
                disabled={activeStep === "upload"}
              >
                Back
              </Button>
              <div className="flex items-center gap-2">
                {activeStep === "preview" ? (
                  <Button
                    onClick={() => void triggerImport()}
                    disabled={importAction.isPending}
                  >
                    <UploadIcon data-icon="inline-start" />
                    Import {csvRows.length} member
                    {csvRows.length !== 1 ? "s" : ""}
                  </Button>
                ) : (
                  <Button
                    onClick={goNext}
                    disabled={!canAdvanceFrom(activeStep)}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
