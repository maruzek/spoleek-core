"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  ArrowUpDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  TrendingUpIcon,
  UserRoundXIcon,
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
import { cn } from "@/lib/utils";
import type { MembershipReportGroupStatus } from "@/server/db/schema";
import type {
  BoardGroupRow,
  BoardReportView,
} from "@/server/queries/membership-reports";
import {
  approveGroupReportAction,
  bulkApproveGroupReportsAction,
  returnGroupReportAction,
  setReportDeadlineAction,
} from "@/server/actions/membership-reports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportHistoryChart } from "@/components/app/report-history-chart";
import { ReportNotice } from "@/components/app/report-notice";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PERIOD_DATE_TIMEZONE,
  }).format(new Date(value));
}

/** A signed count, where a plain "0" reads better than "+0". */
function formatDelta(value: number) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

function Stat({
  value,
  label,
  tone,
  action,
}: {
  value: string;
  label: string;
  tone?: "warning" | "danger";
  /** Rendered top-right, for a stat the board can edit in place. */
  action?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-1 rounded-xl border p-4">
      {action ? <div className="absolute top-2 right-2">{action}</div> : null}
      <span
        className={cn(
          "font-semibold text-2xl tabular-nums",
          tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-orange-600 dark:text-orange-400"
              : undefined,
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  );
}

/** Columns the board can reorder by. `status` is the chase-list default. */
type SortKey = "status" | "group" | "members" | "collected" | "submitted";

function SortableHead({
  label,
  sortKey,
  active,
  descending,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  descending: boolean;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md py-0.5 transition-colors hover:text-foreground",
          align === "right" ? "flex-row-reverse" : undefined,
          active ? "text-foreground" : undefined,
        )}
      >
        {label}
        {!active ? (
          <ArrowUpDownIcon className="size-3 opacity-50" />
        ) : descending ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronUpIcon className="size-3" />
        )}
      </button>
    </TableHead>
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
  const { report, groups, totals, unassigned, missingGroups, history } = view;
  const isEditable = view.isEditable;

  const [statusFilter, setStatusFilter] = useState<
    MembershipReportGroupStatus | "all"
  >("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "status",
    descending: false,
  });
  const [rosterTarget, setRosterTarget] = useState<BoardGroupRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<BoardGroupRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? "Something went wrong.");

  const bulkApprove = useAction(bulkApproveGroupReportsAction, {
    onSuccess({ data }) {
      const approved = data?.approved.length ?? 0;
      const skipped = data?.skipped ?? [];

      if (approved > 0) {
        toast.success(
          `Approved ${approved} report${approved === 1 ? "" : "s"}.`,
        );
      }

      // Named, not counted: a batch that quietly drops rows is worse than one
      // that says which and why.
      for (const row of skipped) {
        toast.warning(`${row.groupName} was not approved — ${row.reason}.`);
      }

      setSelected([]);
      router.refresh();
    },
    onError,
  });
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
  const setDeadline = useAction(setReportDeadlineAction, {
    onSuccess() {
      toast.success("Deadline updated.");
      setDeadlineOpen(false);
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

  const statusCounts = useMemo(() => {
    const counts = new Map<MembershipReportGroupStatus, number>();
    for (const group of groups) {
      counts.set(group.status, (counts.get(group.status) ?? 0) + 1);
    }
    return counts;
  }, [groups]);

  // Rows needing action float to the top by default, so a region nobody has
  // heard from cannot sink out of sight.
  const visibleGroups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    const filtered = groups.filter(
      (group) =>
        (statusFilter === "all" || group.status === statusFilter) &&
        (needle === "" ||
          group.groupName.toLocaleLowerCase(locale).includes(needle)),
    );

    const direction = sort.descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const byName = a.groupName.localeCompare(b.groupName, locale);
      switch (sort.key) {
        case "group":
          return direction * byName;
        case "members":
          return direction * (a.memberCount - b.memberCount) || byName;
        case "collected":
          return direction * (a.feeTotalCents - b.feeTotalCents) || byName;
        case "submitted":
          // Never submitted sorts last whichever way the column points: an
          // empty cell is not "earliest".
          if (!a.submittedAt || !b.submittedAt) {
            return a.submittedAt ? -1 : b.submittedAt ? 1 : byName;
          }
          return (
            direction *
              (new Date(a.submittedAt).getTime() -
                new Date(b.submittedAt).getTime()) || byName
          );
        default:
          return (
            direction * compareReportGroupStatus(a.status, b.status) || byName
          );
      }
    });
  }, [groups, statusFilter, search, sort, locale]);

  // Groups with no row are shown at the bottom of the table rather than in a
  // banner of their own — they are groups, and the table is where the board
  // looks for groups.
  const visibleMissing = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    if (statusFilter !== "all") return [];
    return missingGroups.filter(
      (group) =>
        needle === "" || group.name.toLocaleLowerCase(locale).includes(needle),
    );
  }, [missingGroups, statusFilter, search, locale]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : // Counts and money are most useful largest-first; names are not.
          { key, descending: key !== "group" && key !== "submitted" },
    );

  // Only submitted rows can be approved, so only they are selectable — the
  // header checkbox must not appear to offer anything else.
  const selectableIds = useMemo(
    () =>
      isEditable
        ? visibleGroups
            .filter((group) => group.status === "submitted")
            .map((group) => group.reportGroupId)
        : [],
    [visibleGroups, isEditable],
  );

  const selectedVisible = selected.filter((id) => selectableIds.includes(id));
  const allSelected =
    selectableIds.length > 0 && selectedVisible.length === selectableIds.length;

  const toggleRow = (reportGroupId: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...current, reportGroupId]
        : current.filter((id) => id !== reportGroupId),
    );

  // Only groups with a baseline are compared. A region reporting for the first
  // time is not organizational growth, and counting it as such would overstate
  // every year a region is added.
  const comparable = groups.filter((group) => group.previousMemberCount !== null);
  const hasBaseline = comparable.length > 0;
  const totalDelta = comparable.reduce(
    (sum, group) => sum + group.memberCount - (group.previousMemberCount ?? 0),
    0,
  );
  const baselineLabel = comparable[0]?.previousPeriodLabel ?? null;

  const daysLeft = report.confirmDueAt ? daysUntil(report.confirmDueAt) : null;
  const columnCount =
    6 + (selectableIds.length > 0 ? 1 : 0) + (hasBaseline ? 1 : 0);

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
        <Stat
          value={String(totals.memberCount)}
          label={
            hasBaseline
              ? `Members confirmed · ${formatDelta(totalDelta)} on ${baselineLabel}`
              : "Members confirmed"
          }
          tone={hasBaseline && totalDelta < 0 ? "warning" : undefined}
          action={
            // One year is a dot, not a trend.
            history.length > 1 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Members confirmed over time"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <TrendingUpIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Members confirmed over time</TooltipContent>
              </Tooltip>
            ) : null
          }
        />
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
          action={
            isEditable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Change the confirmation deadline"
                    onClick={() => {
                      // The column is a calendar date; the picker speaks the
                      // same timezone-free `yyyy-MM-dd`.
                      setDeadlineValue(
                        report.confirmDueAt
                          ? new Date(report.confirmDueAt)
                              .toISOString()
                              .slice(0, 10)
                          : "",
                      );
                      setDeadlineOpen(true);
                    }}
                  >
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Change the deadline</TooltipContent>
              </Tooltip>
            ) : null
          }
        />
      </div>

      {/*
        The only notice left standing. Everything else the board used to be
        told in a banner is now visible on the row it concerns; these members
        are on no row at all, which is exactly why they need saying here.
      */}
      {unassigned.length > 0 ? (
        <ReportNotice
          tone="attention"
          icon={<UserRoundXIcon />}
          title={`${unassigned.length} confirmed member${
            unassigned.length === 1 ? " is" : "s are"
          } in no group`}
          description={`They paid or were waived for ${report.periodLabel} but belong to no group that reports, so they appear in no roster below and the total above is short by ${unassigned.length}. Put them in a group, then refresh from payments.`}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUnassigned(true)}
            >
              See who
            </Button>
          }
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a group"
              aria-label="Find a group"
            />
          </InputGroup>

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as MembershipReportGroupStatus | "all")
            }
          >
            <SelectTrigger className="w-[190px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses ({groups.length})</SelectItem>
              {REPORT_GROUP_STATUS_ORDER.map((status) => {
                const count = statusCounts.get(status) ?? 0;
                if (count === 0) return null;
                return (
                  <SelectItem key={status} value={status}>
                    {REPORT_GROUP_STATUS[status].label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            {!isEditable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Status variant="default" className="cursor-help">
                    <StatusLabel>Closed</StatusLabel>
                  </Status>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  This is the {report.periodLabel} record as it was signed off.
                  Nothing can change until somebody reopens the year, and
                  refreshing from payments will refuse to touch it.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {/*
              Bulk approve lives in the toolbar whether or not anything is
              selected. As a bar that appeared on first tick it shifted the
              whole table down under the cursor, which is a poor thing to do to
              somebody halfway through ticking rows.
            */}
            {selectableIds.length > 0 ? (
              <Button
                size="sm"
                disabled={selectedVisible.length === 0 || bulkApprove.isPending}
                onClick={() =>
                  bulkApprove.execute({ reportGroupIds: selectedVisible })
                }
              >
                <CheckIcon data-icon="inline-start" />
                {bulkApprove.isPending
                  ? "Approving…"
                  : selectedVisible.length > 0
                    ? `Approve ${selectedVisible.length} selected`
                    : "Approve selected"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectableIds.length > 0 ? (
                  <TableHead className="w-0">
                    <Checkbox
                      aria-label="Select every report waiting for approval"
                      checked={allSelected}
                      onCheckedChange={(value) =>
                        setSelected(value === true ? selectableIds : [])
                      }
                    />
                  </TableHead>
                ) : null}
                <SortableHead
                  label="Group"
                  sortKey="group"
                  active={sort.key === "group"}
                  descending={sort.descending}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Status"
                  sortKey="status"
                  active={sort.key === "status"}
                  descending={sort.descending}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Members"
                  sortKey="members"
                  align="right"
                  active={sort.key === "members"}
                  descending={sort.descending}
                  onSort={toggleSort}
                />
                {hasBaseline ? (
                  <TableHead className="text-right">vs last year</TableHead>
                ) : null}
                <SortableHead
                  label="Collected"
                  sortKey="collected"
                  align="right"
                  active={sort.key === "collected"}
                  descending={sort.descending}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Submitted"
                  sortKey="submitted"
                  active={sort.key === "submitted"}
                  descending={sort.descending}
                  onSort={toggleSort}
                />
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleGroups.length === 0 && visibleMissing.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    {search.trim()
                      ? `No group matches “${search.trim()}”.`
                      : "No groups with this status."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleGroups.map((group) => {
                  const presentation = REPORT_GROUP_STATUS[group.status];
                  const note = group.returnedReason ?? group.submissionNote;
                  const canSendBack =
                    isEditable &&
                    (group.status === "submitted" ||
                      group.status === "approved");
                  return (
                    <TableRow key={group.reportGroupId}>
                      {selectableIds.length > 0 ? (
                        <TableCell>
                          {group.status === "submitted" ? (
                            <Checkbox
                              aria-label={`Select ${group.groupName}`}
                              checked={selected.includes(group.reportGroupId)}
                              onCheckedChange={(value) =>
                                toggleRow(group.reportGroupId, value === true)
                              }
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium text-sm">
                        {group.groupName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/*
                            The reason a report was sent back, and any note the
                            group left, hang off the status rather than sitting
                            under the name in red — one line per row keeps the
                            table scannable, and the text is one hover away.
                          */}
                          {note ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center gap-1.5">
                                  <Status variant={presentation.variant}>
                                    <StatusLabel>
                                      {presentation.label}
                                    </StatusLabel>
                                  </Status>
                                  <MessageSquareTextIcon className="size-3.5 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {group.returnedReason
                                  ? `Sent back: ${group.returnedReason}`
                                  : note}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Status variant={presentation.variant}>
                              <StatusLabel>{presentation.label}</StatusLabel>
                            </Status>
                          )}
                          {group.selfApproved ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-help">
                                  Self-approved
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Approved by the same person who submitted it.
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                          {group.pendingAdditions > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Status variant="warning" className="cursor-help">
                                  <StatusLabel>
                                    +{group.pendingAdditions} waiting
                                  </StatusLabel>
                                </Status>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {group.pendingAdditions} member
                                {group.pendingAdditions === 1 ? "" : "s"}{" "}
                                confirmed after this was submitted, and{" "}
                                {group.pendingAdditions === 1 ? "is" : "are"} in
                                no count yet. The group admin has to add them,
                                which sends the report back to you for
                                re-approval.
                              </TooltipContent>
                            </Tooltip>
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
                      {hasBaseline ? (
                        <TableCell className="text-right">
                          {group.previousMemberCount === null ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-muted-foreground text-sm">
                                  —
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                This group has not reported before.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span
                                className={cn(
                                  "text-sm tabular-nums",
                                  group.memberCount - group.previousMemberCount <
                                    0
                                    ? "text-destructive"
                                    : undefined,
                                )}
                              >
                                {formatDelta(
                                  group.memberCount - group.previousMemberCount,
                                )}
                              </span>
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {group.previousPeriodLabel}:{" "}
                                {group.previousMemberCount}
                              </span>
                            </div>
                          )}
                        </TableCell>
                      ) : null}
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
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/*
                          One decision per row stays a button; everything else
                          moves into the overflow, so the action column does not
                          change width from status to status.
                        */}
                        <div className="flex items-center justify-end gap-1">
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Actions for ${group.groupName}`}
                              >
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                disabled={group.roster.length === 0}
                                onSelect={() => setRosterTarget(group)}
                              >
                                <UsersIcon />
                                See the roster
                              </DropdownMenuItem>
                              {categoryId && group.groupId ? (
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/admin/groups/${categoryId}/${group.groupId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLinkIcon />
                                    Open the group
                                  </Link>
                                </DropdownMenuItem>
                              ) : null}
                              {canSendBack ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    setReturnTarget(group);
                                    setReturnReason("");
                                  }}
                                >
                                  <UndoIcon />
                                  Send back for changes
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}

              {visibleMissing.map((group) => (
                <TableRow
                  key={`missing-${group.id}`}
                  className="text-muted-foreground"
                >
                  {selectableIds.length > 0 ? <TableCell /> : null}
                  <TableCell className="font-medium text-sm">
                    {group.name}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Status variant="default" className="cursor-help">
                          <StatusLabel>Not in this report</StatusLabel>
                        </Status>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {group.name} joined the fee-managing category after{" "}
                        {report.periodLabel} was opened. Nothing adds it on its
                        own — refresh from payments to give it a row and pull in
                        anyone who has paid.
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right text-sm">—</TableCell>
                  {hasBaseline ? (
                    <TableCell className="text-right text-sm">—</TableCell>
                  ) : null}
                  <TableCell className="text-right text-sm">—</TableCell>
                  <TableCell className="text-sm">—</TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-muted-foreground text-sm">
          Membership year {report.periodLabel} ·{" "}
          {formatDate(report.periodStart, locale)} –{" "}
          {formatDate(report.periodEnd, locale)}
        </p>
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

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Members confirmed over time</DialogTitle>
            <DialogDescription>
              Every year this organization has reported, for the whole
              organization or one group.
            </DialogDescription>
          </DialogHeader>
          <ReportHistoryChart
            history={history}
            currentPeriodLabel={report.periodLabel}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deadlineOpen} onOpenChange={setDeadlineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirmation deadline for {report.periodLabel}
            </DialogTitle>
            <DialogDescription>
              The date every group has to have submitted by. It drives the
              reminder ladder, and applies to this year only — the
              organization&rsquo;s default is unchanged.
            </DialogDescription>
          </DialogHeader>
          <DatePicker
            id="report-deadline"
            value={deadlineValue}
            onChange={setDeadlineValue}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={setDeadline.isPending || !report.confirmDueAt}
              onClick={() =>
                setDeadline.execute({
                  reportId: report.id,
                  confirmDueAt: null,
                })
              }
            >
              Remove the deadline
            </Button>
            <Button
              disabled={setDeadline.isPending || !deadlineValue}
              onClick={() =>
                setDeadline.execute({
                  reportId: report.id,
                  confirmDueAt: deadlineValue,
                })
              }
            >
              {setDeadline.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUnassigned} onOpenChange={setShowUnassigned}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirmed for {report.periodLabel}, in no group
            </DialogTitle>
            <DialogDescription>
              Nobody is reporting these members. Add each to the group that
              should count them, then refresh from payments.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unassigned.map((row) => (
                <TableRow key={row.memberId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {[row.firstName, row.lastName]
                          .filter(Boolean)
                          .join(" ") ||
                          row.email ||
                          "Unknown member"}
                      </span>
                      {row.email &&
                      [row.firstName, row.lastName].filter(Boolean).length >
                        0 ? (
                        <span className="text-muted-foreground text-xs">
                          {row.email}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {row.basis}
                    </Badge>
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
    </div>
  );
}
