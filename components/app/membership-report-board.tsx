"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  UndoIcon,
  UsersIcon,
} from "lucide-react";

import { formatFeeAmount } from "@/lib/payments";
import { PERIOD_DATE_TIMEZONE } from "@/lib/membership-period";
import {
  REPORT_GROUP_STATUS,
  REPORT_GROUP_STATUS_ORDER,
  compareReportGroupStatus,
  daysUntil,
} from "@/lib/membership-report-status";
import type { MembershipReportGroupStatus } from "@/server/db/schema";
import type {
  BoardGroupRow,
  BoardReportView,
} from "@/server/queries/membership-reports";
import {
  approveGroupReportAction,
  returnGroupReportAction,
} from "@/server/actions/membership-reports";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Status, StatusLabel } from "@/components/ui/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PERIOD_DATE_TIMEZONE,
  }).format(new Date(value));
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <span
        className={
          tone === "danger"
            ? "font-semibold text-2xl text-destructive tabular-nums"
            : tone === "warning"
              ? "font-semibold text-2xl text-orange-600 tabular-nums dark:text-orange-400"
              : "font-semibold text-2xl tabular-nums"
        }
      >
        {value}
      </span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  );
}

export function MembershipReportBoard({
  view,
  categoryId,
  locale,
}: {
  view: BoardReportView;
  /** Needed to build the link into each group's own report tab. */
  categoryId: string | null;
  locale: string;
}) {
  const router = useRouter();
  const { report, groups, totals } = view;
  const isEditable = view.isEditable;

  const [statusFilter, setStatusFilter] = useState<
    MembershipReportGroupStatus | "all"
  >("all");
  const [rosterTarget, setRosterTarget] = useState<BoardGroupRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<BoardGroupRow | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? "Something went wrong.");

  const approve = useAction(approveGroupReportAction, {
    onSuccess({ data }) {
      toast.success(
        data?.selfApproved
          ? "Approved. Recorded as self-approved."
          : "Report approved.",
      );
      router.refresh();
    },
    onError,
  });
  const sendBack = useAction(returnGroupReportAction, {
    onSuccess() {
      toast.success("Sent back to the group.");
      setReturnTarget(null);
      setReturnReason("");
      router.refresh();
    },
    onError,
  });

  // Rows needing action float to the top, so a region nobody has heard from
  // cannot sink out of sight.
  const visibleGroups = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? groups
        : groups.filter((group) => group.status === statusFilter);
    return [...filtered].sort(
      (a, b) =>
        compareReportGroupStatus(a.status, b.status) ||
        a.groupName.localeCompare(b.groupName, locale),
    );
  }, [groups, statusFilter, locale]);

  const daysLeft = report.confirmDueAt ? daysUntil(report.confirmDueAt) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={`${totals.submittedCount} / ${totals.groupCount}`}
          label="Groups submitted"
          tone={
            totals.submittedCount < totals.groupCount ? "warning" : undefined
          }
        />
        <Stat value={String(totals.memberCount)} label="Members confirmed" />
        <Stat
          value={formatFeeAmount(totals.feeTotalCents, totals.currency)}
          label="Fees collected"
        />
        <Stat
          value={
            daysLeft === null
              ? "No deadline"
              : daysLeft < 0
                ? `${Math.abs(daysLeft)} days late`
                : `${daysLeft} days`
          }
          label={
            report.confirmDueAt
              ? `Deadline ${formatDate(report.confirmDueAt, locale)}`
              : "No confirmation deadline set"
          }
          tone={
            daysLeft === null
              ? undefined
              : daysLeft < 0
                ? "danger"
                : daysLeft <= 7
                  ? "warning"
                  : undefined
          }
        />
      </div>

      {!isEditable ? (
        <Alert>
          <AlertTitle>The {report.periodLabel} report is closed</AlertTitle>
          <AlertDescription>
            This is the record as it was signed off. Reopen the year from
            &ldquo;Refresh from payments&rdquo; if something genuinely has to
            change.
          </AlertDescription>
        </Alert>
      ) : null}

      {isEditable && totals.pendingAdditions > 0 ? (
        <Alert>
          <AlertTitle>
            {totals.pendingAdditions} member
            {totals.pendingAdditions === 1 ? "" : "s"} confirmed after
            submission
          </AlertTitle>
          <AlertDescription>
            They are not in any count yet. The group admin has to add them,
            which sends that report back to you for re-approval.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(
              (value as MembershipReportGroupStatus | "") || "all",
            )
          }
          variant="outline"
        >
          <ToggleGroupItem value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {groups.length}
            </Badge>
          </ToggleGroupItem>
          {REPORT_GROUP_STATUS_ORDER.map((status) => {
            const count = groups.filter(
              (group) => group.status === status,
            ).length;
            if (count === 0) return null;
            return (
              <ToggleGroupItem key={status} value={status}>
                {REPORT_GROUP_STATUS[status].label}
                <Badge variant="secondary" className="ml-2">
                  {count}
                </Badge>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        <p className="text-muted-foreground text-sm">
          Membership year {report.periodLabel} ·{" "}
          {formatDate(report.periodStart, locale)} –{" "}
          {formatDate(report.periodEnd, locale)}
        </p>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleGroups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground text-sm"
                >
                  No groups with this status.
                </TableCell>
              </TableRow>
            ) : (
              visibleGroups.map((group) => {
                const presentation = REPORT_GROUP_STATUS[group.status];
                return (
                  <TableRow key={group.reportGroupId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {group.groupName}
                        </span>
                        {group.returnedReason ? (
                          <span className="text-destructive text-xs">
                            {group.returnedReason}
                          </span>
                        ) : group.submissionNote ? (
                          <span className="text-muted-foreground text-xs">
                            {group.submissionNote}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Status variant={presentation.variant}>
                          <StatusLabel>{presentation.label}</StatusLabel>
                        </Status>
                        {group.selfApproved ? (
                          <Badge variant="outline">Self-approved</Badge>
                        ) : null}
                        {group.pendingAdditions > 0 ? (
                          <Badge variant="destructive">
                            +{group.pendingAdditions} waiting
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm tabular-nums">
                          {group.memberCount}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {group.paidCount} paid · {group.waivedCount} waived
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatFeeAmount(
                        group.feeTotalCents,
                        group.currency ?? totals.currency,
                      )}
                    </TableCell>
                    <TableCell>
                      {group.submittedAt ? (
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {group.submittedByName ?? "Unknown"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {formatDate(group.submittedAt, locale)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRosterTarget(group)}
                          disabled={group.roster.length === 0}
                        >
                          <UsersIcon data-icon="inline-start" />
                          Roster
                        </Button>
                        {isEditable && group.status === "submitted" ? (
                          <Button
                            size="sm"
                            disabled={approve.isPending}
                            onClick={() =>
                              approve.execute({
                                reportGroupId: group.reportGroupId,
                              })
                            }
                          >
                            <CheckIcon data-icon="inline-start" />
                            Approve
                          </Button>
                        ) : null}
                        {isEditable &&
                        (group.status === "submitted" ||
                          group.status === "approved") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnTarget(group);
                              setReturnReason("");
                            }}
                          >
                            <UndoIcon data-icon="inline-start" />
                            Send back
                          </Button>
                        ) : categoryId && group.groupId ? (
                          <Button size="sm" variant="ghost" asChild>
                            <Link
                              href={`/admin/groups/${categoryId}/${group.groupId}`}
                            >
                              <ExternalLinkIcon data-icon="inline-start" />
                              Open
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={rosterTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRosterTarget(null);
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{rosterTarget?.groupName} roster</DialogTitle>
            <DialogDescription>
              {rosterTarget?.memberCount} member
              {rosterTarget?.memberCount === 1 ? "" : "s"} confirmed for{" "}
              {report.periodLabel}.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Confirmed by</TableHead>
                <TableHead className="text-right">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rosterTarget?.roster.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.included && !row.pendingAddition ? undefined : "opacity-60"
                  }
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {[row.firstName, row.lastName]
                          .filter(Boolean)
                          .join(" ") ||
                          row.email ||
                          "Unknown member"}
                      </span>
                      {row.note ? (
                        <span className="text-muted-foreground text-xs">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {row.pendingAddition
                        ? "waiting"
                        : row.included
                          ? row.confirmationBasis
                          : "left out"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatFeeAmount(
                      row.feeAmountCents ?? 0,
                      row.currency ?? totals.currency,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog
        open={returnTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReturnTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {returnTarget?.groupName} back</DialogTitle>
            <DialogDescription>
              The roster unlocks so they can change it, and any approval is
              cleared. They will see your reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="What needs changing?"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={sendBack.isPending || !returnReason.trim()}
              onClick={() =>
                returnTarget &&
                sendBack.execute({
                  reportGroupId: returnTarget.reportGroupId,
                  reason: returnReason.trim(),
                })
              }
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {report.confirmDueAt && daysLeft !== null && daysLeft < 0 ? (
        <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <ClockIcon className="size-3.5" />
          The deadline passed on {formatDate(report.confirmDueAt, locale)}.
        </p>
      ) : null}
    </div>
  );
}
