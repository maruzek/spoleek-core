"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { BanIcon, CheckIcon, ChevronDownIcon, InboxIcon, XIcon } from "lucide-react";

import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { cn } from "@/lib/utils";
import {
  decideJoinRequestAction,
  setJoinRequestBlockAction,
} from "@/server/actions/group-membership-requests";
import type { GroupJoinRequestRow } from "@/server/queries/groups";

const REASON_MAX = 500;

const column = createColumnHelper<GroupJoinRequestRow>();

function deciderName(row: GroupJoinRequestRow) {
  if (!row.decidedByFirstName && !row.decidedByLastName) return null;
  return getMemberDisplayName({
    firstName: row.decidedByFirstName ?? "",
    lastName: row.decidedByLastName ?? "",
  });
}

/**
 * The group's inbox: who is asking to get in, what they said, and the two
 * buttons. Pending rows are the table; declined ones fold away underneath so
 * the queue an admin has to work through is exactly what they see first.
 */
export function GroupJoinRequestsTab({
  groupId,
  requests,
}: {
  groupId: string;
  requests: GroupJoinRequestRow[];
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [declining, setDeclining] = useState<GroupJoinRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [block, setBlock] = useState(false);
  const [declinedOpen, setDeclinedOpen] = useState(false);

  const pending = useMemo(() => requests.filter((row) => row.status === "pending"), [requests]);
  const declined = useMemo(() => requests.filter((row) => row.status === "declined"), [requests]);

  const decide = useAction(decideJoinRequestAction, {
    onSuccess({ input }) {
      toast.success(input.decision === "approve" ? "Request approved — they are in." : "Request declined.");
      setDeclining(null);
      setReason("");
      setBlock(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not decide this request.");
    },
  });

  const setBlockAction = useAction(setJoinRequestBlockAction, {
    onSuccess({ input }) {
      toast.success(input.blocked ? "Further requests blocked." : "They may request again.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update the block.");
    },
  });

  const busyMemberId = decide.isPending ? decide.input?.memberId : null;

  const columns = useMemo(
    () => [
      column.accessor((row) => getMemberDisplayName(row), {
        id: "member",
        meta: { label: "Member" },
        header: ({ column }) => <SortableHeader column={column}>Member</SortableHeader>,
        filterFn: (row, _id, value: string) =>
          [row.original.firstName, row.original.lastName, row.original.email ?? "", row.original.message ?? ""]
            .join(" ")
            .toLowerCase()
            .includes((value ?? "").trim().toLowerCase()),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/admin/members/${row.original.memberId}`}
              className="truncate font-medium text-foreground hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {getMemberDisplayName(row.original)}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.email ?? "No email"}
            </span>
          </div>
        ),
      }),
      column.accessor("message", {
        meta: { label: "Message" },
        header: "Message",
        enableSorting: false,
        cell: (info) => {
          const message = info.getValue();
          return message ? (
            <p
              className="line-clamp-2 max-w-md border-l-2 border-border pl-3 text-sm text-foreground/90 italic"
              title={message}
            >
              {message}
            </p>
          ) : (
            <span className="text-xs text-muted-foreground">No message</span>
          );
        },
      }),
      column.accessor("requestedAt", {
        meta: { label: "Requested" },
        header: ({ column }) => <SortableHeader column={column}>Requested</SortableHeader>,
        cell: (info) => (
          <span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(info.getValue())}</span>
        ),
      }),
      column.display({
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => {
          const busy = busyMemberId === row.original.memberId;
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setDeclining(row.original)}
              >
                <XIcon data-icon="inline-start" />
                Decline
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  decide.execute({
                    groupId,
                    memberId: row.original.memberId,
                    decision: "approve",
                    reason: null,
                    blockFurtherRequests: false,
                  })
                }
              >
                {busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                Approve
              </Button>
            </div>
          );
        },
      }),
    ],
    [busyMemberId, decide, formatDateTime, groupId],
  );

  const reasonLeft = REASON_MAX - reason.length;

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={pending}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="member"
        searchPlaceholder="Search requests..."
        initialSorting={[{ id: "requestedAt", desc: false }]}
        emptyStateTitle="Nobody is waiting"
        emptyStateDescription="Members who ask to join from their portal will show up here."
      />

      {declined.length > 0 ? (
        <Collapsible open={declinedOpen} onOpenChange={setDeclinedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center justify-between rounded-lg border border-dashed border-border px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <InboxIcon className="size-4" aria-hidden />
                Declined
                <Badge variant="secondary">{declined.length}</Badge>
              </span>
              <ChevronDownIcon
                className={cn("size-4 transition-transform", declinedOpen && "rotate-180")}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border">
              {declined.map((row) => {
                const decider = deciderName(row);
                const toggling =
                  setBlockAction.isPending && setBlockAction.input?.memberId === row.memberId;
                return (
                  <li key={row.membershipId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link
                          href={`/admin/members/${row.memberId}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {getMemberDisplayName(row)}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          declined {formatDateTime(row.decidedAt)}
                          {decider ? ` by ${decider}` : ""}
                        </span>
                      </div>
                      {row.message ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground italic" title={row.message}>
                          “{row.message}”
                        </p>
                      ) : null}
                      {row.declineReason ? (
                        <p className="mt-1 text-sm text-foreground/80">
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">Reason </span>
                          {row.declineReason}
                        </p>
                      ) : null}
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <BanIcon className="size-3.5" aria-hidden />
                      Block further requests
                      <Switch
                        checked={row.requestsBlocked}
                        disabled={toggling}
                        onCheckedChange={(blocked) =>
                          setBlockAction.execute({ groupId, memberId: row.memberId, blocked })
                        }
                        aria-label={`Block further requests from ${getMemberDisplayName(row)}`}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <Dialog
        open={declining !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeclining(null);
            setReason("");
            setBlock(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline {declining ? getMemberDisplayName(declining) : "this request"}?</DialogTitle>
            <DialogDescription>
              They will see that the request was declined. A reason is optional and is
              shown to them word for word.
            </DialogDescription>
          </DialogHeader>
          {declining?.message ? (
            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground italic">
              {declining.message}
            </blockquote>
          ) : null}
          <Field>
            <FieldLabel htmlFor="decline-reason">Reason (optional)</FieldLabel>
            <FieldContent>
              <Textarea
                id="decline-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
                rows={3}
                maxLength={REASON_MAX}
                placeholder="Full this season, wrong region, try the beginners group…"
              />
              <FieldDescription className={cn("text-right tabular-nums", reasonLeft < 40 && "text-orange-600")}>
                {reasonLeft} left
              </FieldDescription>
            </FieldContent>
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Block further requests</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                They will not be able to ask again until you unblock them here.
              </p>
            </div>
            <Switch checked={block} onCheckedChange={setBlock} aria-label="Block further requests" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={decide.isPending || !declining}
              onClick={() =>
                declining &&
                decide.execute({
                  groupId,
                  memberId: declining.memberId,
                  decision: "decline",
                  reason,
                  blockFurtherRequests: block,
                })
              }
            >
              {decide.isPending ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
