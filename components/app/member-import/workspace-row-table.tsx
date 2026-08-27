"use client";

import { Fragment } from "react";
import { ChevronRightIcon, LinkIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";

import { WorkspaceRowFields } from "./workspace-row-fields";
import type { WorkspaceRowView } from "./types";

const MATCHED_BADGE =
  "border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400";

const SOURCE_LABEL = {
  "email-lookup": "Matched by email",
  search: "Found by search",
  provisioned: "Created",
} as const;

/**
 * Every CSV row, always. A row's Workspace state changes in place; nothing is
 * ever filtered out, so a row that gets matched or provisioned stays visible
 * with its new status instead of silently disappearing.
 */
/** Placeholder rows shown while the initial email lookup is still running. */
function SkeletonRows({
  count,
  hasFields,
}: {
  count: number;
  hasFields: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <TableRow key={i}>
          {hasFields && <TableCell className="px-2" />}
          <TableCell />
          <TableCell>
            <Skeleton className="h-3 w-4" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3 w-44" />
            <Skeleton className="mt-1 h-2.5 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function WorkspaceRowTable({
  rows,
  provisionFields,
  loading,
  searching,
  onToggleExpanded,
  onToggleSelected,
  onToggleAll,
  onTargetEmailChange,
  onFieldChange,
  onLinkHit,
  onDismissHit,
  onRetry,
}: {
  rows: WorkspaceRowView[];
  provisionFields: EnabledProvisionField[];
  /** Initial email lookup is running; row states are not yet meaningful. */
  loading: boolean;
  searching: boolean;
  onToggleExpanded: (rowIdx: number) => void;
  onToggleSelected: (rowIdx: number, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  onTargetEmailChange: (rowIdx: number, value: string) => void;
  onFieldChange: (
    rowIdx: number,
    fieldKey: string,
    value: string | boolean,
  ) => void;
  onLinkHit: (rowIdx: number) => void;
  onDismissHit: (rowIdx: number) => void;
  onRetry: (rowIdx: number) => void;
}) {
  const hasFields = provisionFields.length > 0;
  const selectable = rows.filter((r) => !r.match && r.provisioning !== "loading");
  const allSelected =
    selectable.length > 0 && selectable.every((r) => r.selected);
  const someSelected = selectable.some((r) => r.selected);
  const columnCount = (hasFields ? 1 : 0) + 5;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div
        className="max-h-96 overflow-auto"
        aria-busy={loading || searching}
      >
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/60">
            <TableRow>
              {hasFields && <TableHead className="w-8" />}
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  disabled={selectable.length === 0}
                  aria-label="Select all rows that need an account"
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                />
              </TableHead>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Workspace account</TableHead>
              <TableHead className="w-56">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <SkeletonRows
                count={Math.min(rows.length, 8)}
                hasFields={hasFields}
              />
            )}
            {!loading &&
              rows.map((row) => {
              const resolved = Boolean(row.match);
              const expandable = hasFields && !resolved;
              // A pending directory hit is the one thing on this screen that
              // needs a decision, so the whole row is tinted rather than
              // relying on a small button in the last column.
              const awaitingDecision = !resolved && Boolean(row.hit);

              return (
                <Fragment key={row.rowIdx}>
                  <TableRow
                    className={
                      awaitingDecision ? "bg-primary/5 hover:bg-primary/10" : ""
                    }
                  >
                    {hasFields && (
                      <TableCell className="px-2">
                        {expandable ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => onToggleExpanded(row.rowIdx)}
                            aria-expanded={row.expanded}
                            aria-label={
                              row.expanded
                                ? `Collapse fields for ${row.name}`
                                : `Expand fields for ${row.name}`
                            }
                          >
                            <ChevronRightIcon
                              className={`size-3 transition-transform ${row.expanded ? "rotate-90" : ""}`}
                            />
                            {!row.expanded && row.requiredMissing ? (
                              <span
                                className="size-1.5 rounded-full bg-destructive"
                                aria-label="A required account field is empty"
                              />
                            ) : null}
                          </button>
                        ) : null}
                      </TableCell>
                    )}

                    <TableCell>
                      {resolved ? null : (
                        <Checkbox
                          checked={row.selected}
                          disabled={row.provisioning === "loading"}
                          aria-label={`Create an account for ${row.name}`}
                          onCheckedChange={(checked) =>
                            onToggleSelected(row.rowIdx, checked === true)
                          }
                        />
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground tabular-nums">
                      {row.rowIdx + 1}
                    </TableCell>

                    <TableCell className="font-medium">
                      {row.name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {row.match ? (
                        <div>
                          <div>{row.match.workspaceUserEmail}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {row.match.fullName}
                          </div>
                        </div>
                      ) : row.hit ? (
                        <div>
                          <div>{row.hit.primaryEmail}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {row.hit.fullName} · found in directory
                          </div>
                        </div>
                      ) : searching && row.hit === undefined ? (
                        <>
                          <Skeleton className="h-3 w-44" />
                          <Skeleton className="mt-1 h-2.5 w-24" />
                        </>
                      ) : (
                        <Input
                          className="h-7 text-xs"
                          value={row.targetEmail}
                          disabled={row.provisioning === "loading"}
                          aria-label={`Email address to create for ${row.name}`}
                          onChange={(e) =>
                            onTargetEmailChange(row.rowIdx, e.target.value)
                          }
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {row.match ? (
                        <Badge variant="outline" className={MATCHED_BADGE}>
                          {SOURCE_LABEL[row.match.source]}
                        </Badge>
                      ) : row.provisioning === "loading" ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Loader2Icon className="size-3 animate-spin" />
                          Creating…
                        </span>
                      ) : row.provisioning === "error" ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="destructive" className="text-xs">
                            {row.provisionError ?? "Failed"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => onRetry(row.rowIdx)}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : row.hit ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => onLinkHit(row.rowIdx)}
                          >
                            <LinkIcon data-icon="inline-start" />
                            Link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => onDismissHit(row.rowIdx)}
                          >
                            Not a match
                          </Button>
                        </div>
                      ) : searching && row.hit === undefined ? (
                        <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                      ) : row.selected ? (
                        <span className="text-muted-foreground">
                          Will be created
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </TableCell>
                  </TableRow>

                  {expandable && row.expanded ? (
                    <TableRow>
                      <TableCell colSpan={columnCount} className="p-0">
                        <WorkspaceRowFields
                          fields={provisionFields}
                          values={row.fieldValues}
                          onChange={(fieldKey, value) =>
                            onFieldChange(row.rowIdx, fieldKey, value)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
