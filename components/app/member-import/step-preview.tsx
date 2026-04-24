"use client";

import { useMemo } from "react";
import {
  AlertTriangleIcon,
  InfoIcon,
  UsersIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import type { ImportMemberRow } from "@/lib/member-admin";

export function StepPreview({
  editableRows,
  onRowsChange,
  importStatus,
  onImportStatusChange,
  duplicateEmails,
}: {
  editableRows: ImportMemberRow[];
  onRowsChange: (rows: ImportMemberRow[]) => void;
  importStatus: "active" | "pending";
  onImportStatusChange: (status: "active" | "pending") => void;
  duplicateEmails: string[];
}) {
  const columnKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of editableRows) {
      if (row.firstName) keys.add("firstName");
      if (row.lastName) keys.add("lastName");
      if (row.email) keys.add("email");
      if (row.workspaceUserEmail) keys.add("workspaceUserEmail");
      keys.add("role");
      keys.add("status");
      for (const k of Object.keys(row.customFieldAnswers)) {
        keys.add(`custom:${k}`);
      }
    }
    return [...keys];
  }, [editableRows]);

  const displayLabel = (key: string) => {
    const labels: Record<string, string> = {
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
      workspaceUserEmail: "Workspace Email",
      role: "Role",
      status: "Status",
    };
    if (key.startsWith("custom:")) return key.slice(7);
    return labels[key] ?? key;
  };

  const getCellValue = (row: ImportMemberRow, key: string): string => {
    if (key === "firstName") return row.firstName;
    if (key === "lastName") return row.lastName;
    if (key === "email") return row.email ?? "";
    if (key === "workspaceUserEmail") return row.workspaceUserEmail ?? "";
    if (key === "role") return row.role;
    if (key === "status") return row.status;
    if (key.startsWith("custom:")) {
      const cfKey = key.slice(7);
      return String(row.customFieldAnswers[cfKey] ?? "");
    }
    return "";
  };

  const setCellValue = (
    rowIndex: number,
    key: string,
    value: string,
  ) => {
    const updated = [...editableRows];
    const row = { ...updated[rowIndex]! };
    if (key === "firstName") row.firstName = value;
    else if (key === "lastName") row.lastName = value;
    else if (key === "email") row.email = value || undefined;
    else if (key === "role") {
      if (
        value === "member" ||
        value === "leader" ||
        value === "org_admin"
      )
        row.role = value;
    } else if (key === "status") {
      if (
        ["invited", "pending", "active", "suspended", "archived"].includes(
          value,
        )
      )
        row.status = value as typeof row.status;
    } else if (key.startsWith("custom:")) {
      const cfKey = key.slice(7);
      row.customFieldAnswers = { ...row.customFieldAnswers, [cfKey]: value };
    }
    updated[rowIndex] = row;
    onRowsChange(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Review & Confirm</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Check and edit the import data before proceeding.
        </p>
      </div>

      <Alert>
        <InfoIcon />
        <AlertTitle>Additive import only</AlertTitle>
        <AlertDescription>
          This import will never delete members. Existing members matched by
          email address will be <strong>updated</strong> with the new data. All
          other rows will create new member records.
        </AlertDescription>
      </Alert>

      {duplicateEmails.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangleIcon className="text-amber-600" />
          <AlertTitle>Duplicate emails detected</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            The following email addresses appear more than once in the CSV. The
            last row for each will be used:{" "}
            <span className="font-mono text-xs">
              {duplicateEmails.join(", ")}
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Default status for new members</p>
          <p className="text-xs text-muted-foreground">
            Unless overridden by a mapped &quot;Status&quot; column
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Pending</span>
          <Switch
            checked={importStatus === "active"}
            onCheckedChange={(checked) =>
              onImportStatusChange(checked ? "active" : "pending")
            }
          />
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
        <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm">
          <strong>{editableRows.length}</strong> row
          {editableRows.length !== 1 ? "s" : ""} will be imported with status{" "}
          <Badge
            variant={importStatus === "active" ? "default" : "secondary"}
            className="text-xs"
          >
            {importStatus}
          </Badge>
        </span>
      </div>

      {/* Editable table */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Data ({editableRows.length} rows — click cells to edit)
        </p>
        <div className="max-h-[400px] overflow-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">#</th>
                {columnKeys.map((key) => (
                  <th key={key} className="px-3 py-2 text-left font-medium">
                    {displayLabel(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {editableRows.map((row, i) => (
                <tr key={i} className="bg-background hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                    {i + 1}
                  </td>
                  {columnKeys.map((key) => {
                    const isReadOnly =
                      key === "workspaceUserEmail";
                    const isSelect = key === "role" || key === "status";

                    if (isReadOnly) {
                      return (
                        <td
                          key={key}
                          className="max-w-40 truncate px-3 py-1.5 text-muted-foreground"
                        >
                          {getCellValue(row, key)}
                        </td>
                      );
                    }

                    if (isSelect) {
                      const options =
                        key === "role"
                          ? ["member", "leader", "org_admin"]
                          : [
                              "invited",
                              "pending",
                              "active",
                              "suspended",
                              "archived",
                            ];
                      return (
                        <td key={key} className="px-1 py-0.5">
                          <select
                            className="h-7 w-full rounded border-transparent bg-transparent px-1 text-xs focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
                            value={getCellValue(row, key)}
                            onChange={(e) =>
                              setCellValue(i, key, e.target.value)
                            }
                          >
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    return (
                      <td key={key} className="px-1 py-0.5">
                        <input
                          type="text"
                          className="h-7 w-full min-w-20 rounded border-transparent bg-transparent px-2 text-xs focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
                          value={getCellValue(row, key)}
                          onChange={(e) =>
                            setCellValue(i, key, e.target.value)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
