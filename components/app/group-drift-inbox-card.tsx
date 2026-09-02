"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  EyeOffIcon,
  Loader2Icon,
  UserPlusIcon,
  UserRoundXIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  canAdoptDrift,
  describeDriftMemberType,
} from "@/lib/workspace-group-drift";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import {
  adoptWorkspaceGroupDriftAction,
  ignoreWorkspaceGroupDriftAction,
  removeWorkspaceGroupDriftAction,
} from "@/server/actions/workspace-group-drift";
import type { WorkspaceDriftRow } from "@/server/queries/workspace-group-drift";

type GroupDriftInboxCardProps = {
  rows: WorkspaceDriftRow[];
  canManage: boolean;
};

/**
 * The drift inbox: everyone who is in the linked Google group but not in this
 * Spoleek group. Push mode never deletes these addresses on its own, so without
 * somewhere to decide about them they would sit in the Google group forever,
 * visible only as "Leave alone" rows in a sync preview.
 */
export function GroupDriftInboxCard({
  rows,
  canManage,
}: GroupDriftInboxCardProps) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);

  const { open, ignored } = useMemo(
    () => ({
      open: rows.filter((row) => row.status === "open"),
      ignored: rows.filter((row) => row.status === "ignored"),
    }),
    [rows],
  );

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

      // Each skipped address says why in its own toast: the reasons differ per
      // address, and a single count would tell the admin nothing actionable.
      for (const reason of data.skipped) {
        toast.warning(reason);
      }

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
      toast.success(data.ignored ? "Ignored." : "Back in the inbox.");
      settle();
    },
    onError,
  });

  if (rows.length === 0) return null;

  const runAdopt = (driftIds: string[]) => {
    setBusyIds(driftIds);
    adopt.execute({ driftIds });
  };

  const runRemove = (driftIds: string[]) => {
    setBusyIds(driftIds);
    remove.execute({ driftIds });
  };

  const adoptable = open.filter((row) => canAdoptDrift(row.memberType));

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
          In Google, not in Spoleek
        </div>
        <CardTitle>
          {open.length === 0
            ? "Nothing left to review"
            : `${open.length} address${open.length === 1 ? "" : "es"} need${open.length === 1 ? "s" : ""} a decision`}
        </CardTitle>
        <CardDescription>
          Spoleek found these in the linked Google group and will never delete
          them on its own. Adopt someone to add them to this group, remove them
          from Google, or ignore them for good.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {open.map((row) => {
          const busy = busyIds.includes(row.id);
          const typeNote = describeDriftMemberType(row.memberType);
          const canAdopt = canAdoptDrift(row.memberType);

          return (
            <Item key={row.id} variant="outline" className="bg-background">
              <ItemContent>
                <ItemTitle className="line-clamp-none flex flex-wrap items-center gap-2">
                  <span className="font-mono">{row.address}</span>
                  {row.matchedMemberName ? (
                    <Status variant="info" className="font-sans">
                      <StatusIndicator />
                      <StatusLabel>{row.matchedMemberName}</StatusLabel>
                    </Status>
                  ) : null}
                  {typeNote ? (
                    <Status variant="warning" className="font-sans">
                      <StatusIndicator />
                      <StatusLabel>{typeNote}</StatusLabel>
                    </Status>
                  ) : null}
                </ItemTitle>
                <ItemDescription>
                  {row.matchedMemberName
                    ? `Already a Spoleek member — adopting adds them to this group.`
                    : "Not in Spoleek — adopting creates a pending member."}
                  {` · Google role: ${row.role} · First seen ${formatDateTime(row.firstSeenAt)}`}
                </ItemDescription>
              </ItemContent>
              {canManage ? (
                <ItemActions>
                  {canAdopt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => runAdopt([row.id])}
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
                  {row.direction === "push" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => runRemove([row.id])}
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
                    onClick={() => {
                      setBusyIds([row.id]);
                      ignore.execute({ driftIds: [row.id], ignored: true });
                    }}
                  >
                    <EyeOffIcon data-icon="inline-start" />
                    Ignore
                  </Button>
                </ItemActions>
              ) : null}
            </Item>
          );
        })}

        {canManage && adoptable.length > 1 ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={adopt.isPending}
              onClick={() => runAdopt(adoptable.map((row) => row.id))}
            >
              {adopt.isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <UserPlusIcon data-icon="inline-start" />
              )}
              Adopt all {adoptable.length}
            </Button>
          </div>
        ) : null}

        {ignored.length > 0 ? (
          <Collapsible open={showIgnored} onOpenChange={setShowIgnored}>
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                {showIgnored ? "Hide" : "Show"} {ignored.length} ignored
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3 pt-3">
              {ignored.map((row) => (
                <Item key={row.id} variant="outline" className="bg-background">
                  <ItemContent>
                    <ItemTitle className="line-clamp-none font-mono">
                      {row.address}
                    </ItemTitle>
                    <ItemDescription>
                      Ignored — still in {row.workspaceGroupEmail}, never touched
                      by Spoleek.
                    </ItemDescription>
                  </ItemContent>
                  {canManage ? (
                    <ItemActions>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyIds.includes(row.id)}
                        onClick={() => {
                          setBusyIds([row.id]);
                          ignore.execute({
                            driftIds: [row.id],
                            ignored: false,
                          });
                        }}
                      >
                        <Undo2Icon data-icon="inline-start" />
                        Review again
                      </Button>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  );
}
