"use client";

import { useMemo } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { FieldMappingCombobox } from "./field-mapping-combobox";
import type { FieldTarget, ParsedRow } from "./types";

export function StepMapFields({
  csvHeaders,
  csvRows,
  columnMappings,
  fieldOptions,
  onMappingChange,
}: {
  csvHeaders: string[];
  csvRows: ParsedRow[];
  columnMappings: Record<string, FieldTarget | null>;
  fieldOptions: { value: FieldTarget; label: string }[];
  onMappingChange: (header: string, value: FieldTarget | null) => void;
}) {
  const hasName = Object.values(columnMappings).some(
    (v) => v === "first_name" || v === "last_name",
  );

  const usedTargets = useMemo(() => {
    const targets = Object.values(columnMappings).filter(
      (v): v is FieldTarget => v != null,
    );
    return new Set(targets);
  }, [columnMappings]);

  const hasDuplicates = useMemo(() => {
    const targets = Object.values(columnMappings).filter(
      (v): v is FieldTarget => v != null,
    );
    return new Set(targets).size < targets.length;
  }, [columnMappings]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Map CSV Columns</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Assign each column in your file to a Spoleek field. At least one name
          field (First Name or Last Name) must be mapped.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border">
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
                <Badge variant="outline" className="font-mono text-xs">
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
                  usedTargets={usedTargets}
                  onChange={(v) => onMappingChange(header, v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {hasDuplicates && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangleIcon className="text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            Some fields are mapped to multiple columns. Only the last column for
            each field will take effect.
          </AlertDescription>
        </Alert>
      )}

      {!hasName && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangleIcon className="text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            Map at least one name column (First Name or Last Name) to continue.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
