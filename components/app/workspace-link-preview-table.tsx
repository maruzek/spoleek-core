"use client";

import {
  workspaceLinkPlanActionMeta,
  type WorkspaceLinkPlanRow,
} from "@/lib/workspace-group-links";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";

/**
 * The dry run, row by row. Counts alone ask the admin to trust four numbers;
 * a table lets them check the specific people before anything reaches Google.
 */
export function WorkspaceLinkPreviewTable({
  rows,
  emptyLabel = "Nothing to change — this group already matches.",
}: {
  rows: WorkspaceLinkPlanRow[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-6 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="max-h-[320px] overflow-auto rounded-xl border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="border-b bg-muted text-muted-foreground">
            <th className="bg-muted px-3 py-2 text-left font-medium">Action</th>
            <th className="bg-muted px-3 py-2 text-left font-medium">Person</th>
            <th className="bg-muted px-3 py-2 text-left font-medium">Google role</th>
            <th className="bg-muted px-3 py-2 text-left font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const meta = workspaceLinkPlanActionMeta[row.action];

            return (
              <tr
                key={`${row.action}-${row.address}-${index}`}
                className="border-t bg-background hover:bg-muted/20"
              >
                <td className="px-3 py-1.5">
                  <Status variant={meta.variant} className="font-sans">
                    <StatusIndicator />
                    <StatusLabel>{meta.label}</StatusLabel>
                  </Status>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {row.name ?? row.address}
                    </span>
                    {row.name && row.address ? (
                      <span className="font-mono text-muted-foreground">
                        {row.address}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {row.currentRole && row.nextRole && row.currentRole !== row.nextRole
                    ? `${row.currentRole} → ${row.nextRole}`
                    : (row.nextRole ?? row.currentRole ?? "—")}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {row.note ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
