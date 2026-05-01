"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MemberGroupAssignmentField } from "@/components/app/member-group-assignment-field";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";

import type {
  GroupAssignmentConfig,
  GroupAssignmentMode,
  ParsedRow,
} from "./types";

const NONE_SENTINEL = "__none__";

export function StepGroups({
  csvHeaders,
  csvRows,
  groupAssignment,
  manageableGroupCategories,
  onGroupAssignmentChange,
}: {
  csvHeaders: string[];
  csvRows: ParsedRow[];
  groupAssignment: GroupAssignmentConfig;
  manageableGroupCategories: MemberManagementGroupCategory[];
  onGroupAssignmentChange: (config: GroupAssignmentConfig) => void;
}) {
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">Group Assignment</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Optionally assign imported members to groups. You can map a CSV column
          to groups, assign all members to fixed groups, or skip.
        </p>
      </div>

      <ToggleGroup
        type="single"
        value={groupAssignment.mode}
        onValueChange={(v) => {
          if (v) {
            onGroupAssignmentChange({
              ...groupAssignment,
              mode: v as GroupAssignmentMode,
            });
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
            onGroupAssignmentChange({
              ...groupAssignment,
              fixedGroupIds: ids,
            })
          }
        />
      )}

      {groupAssignment.mode === "column" && (
        <div className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Which column contains group names?</FieldLabel>
              <FieldContent>
                <Select
                  value={groupAssignment.columnMapping?.columnKey ?? NONE_SENTINEL}
                  onValueChange={(v) => {
                    const col = v === NONE_SENTINEL ? "" : v;
                    if (!col) {
                      onGroupAssignmentChange({
                        ...groupAssignment,
                        columnMapping: null,
                      });
                      return;
                    }
                    const vals = new Set(
                      csvRows
                        .map((r) => (r[col] ?? "").trim())
                        .filter(Boolean),
                    );
                    const valueToGroupId: Record<string, string | null> = {};
                    for (const v of vals) valueToGroupId[v] = null;
                    onGroupAssignmentChange({
                      ...groupAssignment,
                      columnMapping: { columnKey: col, valueToGroupId },
                    });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— select a column —" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={NONE_SENTINEL}>
                      — select a column —
                    </SelectItem>
                    {csvHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>

          {groupAssignment.columnMapping && columnGroups.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Map column values → groups
              </p>
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-2 gap-px bg-border text-xs font-medium text-muted-foreground">
                  <div className="bg-muted/60 px-3 py-2">CSV Value</div>
                  <div className="bg-muted/60 px-3 py-2">Spoleek Group</div>
                </div>
                <div className="divide-y">
                  {columnGroups.map((val) => (
                    <div
                      key={val}
                      className="grid grid-cols-2 items-center gap-px"
                    >
                      <div className="bg-background px-3 py-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {val}
                        </Badge>
                      </div>
                      <div className="bg-background px-3 py-2">
                        <Select
                          value={
                            groupAssignment.columnMapping?.valueToGroupId[
                              val
                            ] ?? NONE_SENTINEL
                          }
                          onValueChange={(v) => {
                            if (!groupAssignment.columnMapping) return;
                            onGroupAssignmentChange({
                              ...groupAssignment,
                              columnMapping: {
                                ...groupAssignment.columnMapping,
                                valueToGroupId: {
                                  ...groupAssignment.columnMapping
                                    .valueToGroupId,
                                  [val]:
                                    v === NONE_SENTINEL ? null : v,
                                },
                              },
                            });
                          }}
                        >
                          <SelectTrigger size="sm" className="w-full text-xs">
                            <SelectValue placeholder="— ignore —" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value={NONE_SENTINEL}>
                              — ignore —
                            </SelectItem>
                            {allGroups.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.categoryName} / {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
  );
}
