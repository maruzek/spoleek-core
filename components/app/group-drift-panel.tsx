"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ExternalLinkIcon,
  EyeOffIcon,
  Loader2Icon,
  Undo2Icon,
  UserPlusIcon,
  UserRoundXIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  canAdoptDrift,
  describeDriftMemberType,
} from "@/lib/workspace-group-drift";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  adoptWorkspaceGroupDriftAction,
  ignoreWorkspaceGroupDriftAction,
  removeWorkspaceGroupDriftAction,
} from "@/server/actions/workspace-group-drift";
import type { WorkspaceDriftRow } from "@/server/queries/workspace-group-drift";

const columnHelper = createColumnHelper<WorkspaceDriftRow>();

/**
 * Everyone who is in the linked Google group but not in this Spoleek group.
 *
 * This lives in its own tab rather than above the roster: a group can easily
 * have more drift than members, and the roster is what an admin came to the
 * page to see. The tab's count is the ambient signal instead.
 */
/**
 * Google returns a member id for external subscribers too, but the Admin
 * console only knows accounts in your own directory — so a link is offered
 * only for an address inside the Workspace domain.
 */
function adminConsoleUrl(
  row: WorkspaceDriftRow,
  workspaceDomain: string | null,
) {
  if (!row.workspaceUserId) return null;
  if (row.memberType.toUpperCase() !== "USER") return null;

  const domain = workspaceDomain?.trim().toLowerCase();
  if (domain && !row.address.endsWith(`@${domain}`)) return null;

  return `https://admin.google.com/ac/users/${row.workspaceUserId}`;
}

export function GroupDriftPanel({
  rows,
  canManage,
  workspaceDomain,
}: {
  rows: WorkspaceDriftRow[];
  canManage: boolean;
  workspaceDomain: string | null;
}) {
  const { formatDateTime } = useFormatters();

  const router = useRouter();
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const openRows = useMemo(
    () => rows.filter((row) => row.status === "open"),
    [rows],
  );
  const workspaceGroupEmail = rows[0]?.workspaceGroupEmail ?? "";
  const canRemove = rows.some((row) => row.direction === "push");

  const settle = () => {
    setBusyIds([]);
    router.refresh();
  };

  const onError = ({ error }: { error: { serverError?: string } }) => {
    setBusyIds([]);
    if (error.serverError) toast.error(error.serverError);
  };

  const adopt = useAction(adoptWorkspaceGroupDriftAction, {
    onSuccess({ data }) {
      if (!data?.success) return;

      if (data.adopted > 0) {
        toast.success(
          data.createdMembers > 0
            ? `Adopted ${data.adopted} — ${data.createdMembers} new member${data.createdMembers === 1 ? "" : "s"} to approve.`
            : `Adopted ${data.adopted}.`,
        );
      }

      // Each refusal says why in its own toast: the reasons differ per address,
      // and a single count would tell the admin nothing actionable.
      for (const reason of data.skipped) toast.warning(reason);

      settle();
    },
    onError,
  });

  const remove = useAction(removeWorkspaceGroupDriftAction, {
    onSuccess({ data }) {
      if (!data?.success) return;
      toast.success(
        `Queued ${data.queued} removal${data.queued === 1 ? "" : "s"} in Google.`,
      );
      settle();
    },
    onError,
  });

  const ignore = useAction(ignoreWorkspaceGroupDriftAction, {
    onSuccess({ data }) {
      if (!data?.success) return;
      toast.success(data.ignored ? "Ignored." : "Back in the list.");
      settle();
    },
    onError,
  });

  const runAdopt = (driftIds: string[]) => {
    setBusyIds(driftIds);
    adopt.execute({ driftIds });
  };

  const runRemove = (driftIds: string[]) => {
    setBusyIds(driftIds);
    remove.execute({ driftIds });
  };

  const runIgnore = (driftIds: string[], ignored: boolean) => {
    setBusyIds(driftIds);
    ignore.execute({ driftIds, ignored });
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value: boolean | "indeterminate") =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean | "indeterminate") =>
              row.toggleSelected(!!value)
            }
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor(
        (row) => [row.address, row.matchedMemberName ?? ""].join(" "),
        {
          id: "address",
          header: "Address",
          cell: ({ row }) => {
            const typeNote = describeDriftMemberType(row.original.memberType);

            return (
              <div className="flex flex-col gap-1">
                <span className="font-mono font-medium text-foreground">
                  {row.original.address}
                </span>
                <span className="text-sm text-muted-foreground">
                  {row.original.matchedMemberName ??
                    (typeNote ?? "Not in Spoleek")}
                </span>
              </div>
            );
          },
        },
      ),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ row }) =>
          row.original.status === "ignored" ? (
            <Badge variant="outline">Ignored</Badge>
          ) : row.original.matchedMemberId ? (
            <Badge variant="secondary">Known member</Badge>
          ) : (
            <Badge variant="secondary">Unknown</Badge>
          ),
      }),
      columnHelper.accessor("role", {
        header: "Google role",
        cell: (info) => (
          <Badge variant={info.getValue() === "member" ? "secondary" : "default"}>
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("firstSeenAt", {
        header: "First seen",
        cell: (info) => (
          <span className="text-muted-foreground">
            {formatDateTime(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const entry = row.original;
          const busy = busyIds.includes(entry.id);
          const consoleUrl = adminConsoleUrl(entry, workspaceDomain);

          return (
            <div className="flex items-center justify-end gap-1">
              {consoleUrl ? (
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${entry.address} in the Google Admin console`}
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    Google
                  </a>
                </Button>
              ) : null}

              {!canManage ? null : entry.status === "ignored" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => runIgnore([entry.id], false)}
                >
                  <Undo2Icon data-icon="inline-start" />
                  Review again
                </Button>
              ) : (
                <>
                  {canAdoptDrift(entry.memberType) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => runAdopt([entry.id])}
                    >
                      {busy && adopt.isPending ? (
                        <Loader2Icon
                          data-icon="inline-start"
                          className="animate-spin"
                        />
                      ) : (
                        <UserPlusIcon data-icon="inline-start" />
                      )}
                      Adopt
                    </Button>
                  ) : null}
                  {entry.direction === "push" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => runRemove([entry.id])}
                    >
                      <UserRoundXIcon data-icon="inline-start" />
                      Remove
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => runIgnore([entry.id], true)}
                  >
                    <EyeOffIcon data-icon="inline-start" />
                    Ignore
                  </Button>
                </>
              )}
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyIds, canManage, workspaceDomain, adopt.isPending],
  );

  return (
    <div className="flex flex-col gap-4">
      {openRows.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
            In Google, not in Spoleek
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {openRows.length} address{openRows.length === 1 ? "" : "es"}
            </span>{" "}
            {openRows.length === 1 ? "is" : "are"} in{" "}
            <span className="font-mono">{workspaceGroupEmail}</span> but not in
            this group. Spoleek never deletes them on its own —{" "}
            <strong className="font-medium text-foreground">adopt</strong> to add
            them here,
            {canRemove ? (
              <>
                {" "}
                <strong className="font-medium text-foreground">
                  remove
                </strong>{" "}
                to delete them from Google,
              </>
            ) : null}{" "}
            or <strong className="font-medium text-foreground">ignore</strong> to
            stop listing them.
          </p>
        </div>
      ) : null}

      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="address"
        searchPlaceholder="Search addresses..."
        emptyStateTitle="Nothing to review"
        emptyStateDescription="The Google group matches this group's roster."
        toolbarActions={(table) => {
          const selected = table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)
            .filter((row) => row.status === "open");

          if (!canManage || selected.length === 0) return null;

          const adoptable = selected.filter((row) =>
            canAdoptDrift(row.memberType),
          );

          return (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adopt.isPending || adoptable.length === 0}
                onClick={() => runAdopt(adoptable.map((row) => row.id))}
              >
                {adopt.isPending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <UserPlusIcon data-icon="inline-start" />
                )}
                Adopt {adoptable.length}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={ignore.isPending}
                onClick={() =>
                  runIgnore(
                    selected.map((row) => row.id),
                    true,
                  )
                }
              >
                <EyeOffIcon data-icon="inline-start" />
                Ignore {selected.length}
              </Button>
            </div>
          );
        }}
      />
    </div>
  );
}
