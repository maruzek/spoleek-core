"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  ArrowRightLeftIcon,
  CalendarOffIcon,
  CheckIcon,
  PlusIcon,
  UndoIcon,
} from "lucide-react";

import { formatFeeAmount } from "@/lib/payments";
import { PERIOD_DATE_TIMEZONE } from "@/lib/membership-period";
import {
  REPORT_GROUP_STATUS,
  REPORT_GROUP_STATUS_ORDER,
  REPORT_STATUS_TONE,
  daysUntil,
  describeReportGroupStatus,
} from "@/lib/membership-report-status";
import { cn } from "@/lib/utils";
import type {
  GroupReportAbsentView,
  GroupReportTabView,
  GroupReportView,
} from "@/server/queries/membership-reports";
import {
  acceptPendingAdditionAction,
  addReportMemberManuallyAction,
  setReportMemberInclusionAction,
  submitGroupReportAction,
} from "@/server/actions/membership-reports";
import { ReportNotice } from "@/components/app/report-notice";
import { ReportPeriodPicker } from "@/components/app/report-period-picker";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// Period bounds and the deadline are calendar dates held as midnight UTC, so
// they must be rendered in UTC. Formatting them locally shifts them a day.
function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PERIOD_DATE_TIMEZONE,
  }).format(new Date(value));
}

function memberName(row: { firstName: string | null; lastName: string | null; email: string | null }) {
  return (
    [row.firstName, row.lastName].filter(Boolean).join(" ") ||
    row.email ||
    "Unknown member"
  );
}

/**
 * One cell of the strip along the bottom of the status card.
 *
 * `caption` names the number and `label` qualifies it — "5 / Members counted /
 * 4 paid · 1 waived" — so the strip reads the same way in all three columns.
 */
function HeroStat({
  value,
  caption,
  label,
  tone,
}: {
  value: string;
  caption: string;
  label?: string;
  tone?: "attention";
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3">
      <span className="font-semibold text-lg tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{caption}</span>
      {label ? (
        <span
          className={cn(
            "text-xs",
            tone === "attention"
              ? "font-medium text-orange-600 dark:text-orange-400"
              : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The report tab for one group.
 *
 * Split in two because a group can be looking at a year it was never part of.
 * That is a real state with a real page — the year, and the picker to get out
 * of it — not an absence to render nothing for.
 */
export function GroupReportCard({
  view,
  groupName,
  locale,
}: {
  view: GroupReportTabView;
  groupName: string;
  locale: string;
}) {
  if (view.reportGroup === null) {
    return (
      <GroupReportAbsent view={view} groupName={groupName} locale={locale} />
    );
  }

  return <GroupReportRoster view={view} groupName={groupName} locale={locale} />;
}

function YearHeader({
  view,
  locale,
}: {
  view: GroupReportTabView;
  locale: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="font-medium text-base">
          Membership year {view.report.periodLabel}
        </h2>
        <span className="text-muted-foreground text-xs">
          {formatDate(view.report.periodStart, locale)} –{" "}
          {formatDate(view.report.periodEnd, locale)}
        </span>
        {!view.isEditable ? <Badge variant="outline">Closed</Badge> : null}
      </div>
      <ReportPeriodPicker
        periods={view.periods}
        currentReportId={view.report.id}
      />
    </div>
  );
}

function GroupReportAbsent({
  view,
  groupName,
  locale,
}: {
  view: GroupReportAbsentView;
  groupName: string;
  locale: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <YearHeader view={view} locale={locale} />
      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarOffIcon />
          </EmptyMedia>
          <EmptyTitle>
            {groupName} is not in the {view.report.periodLabel} report
          </EmptyTitle>
          <EmptyDescription>
            It had no row when that year was opened — the group was created, or
            moved into the fee-managing category, later on. Nothing adds a group
            to a report after the fact, so there is nothing to confirm here.
            Pick a year this group took part in, or ask the board to refresh{" "}
            {view.report.periodLabel} from payments.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function GroupReportRoster({
  view,
  groupName,
  locale,
}: {
  view: GroupReportView;
  groupName: string;
  locale: string;
}) {
  const router = useRouter();
  const { report, reportGroup, roster, peers, addableMembers, comparison } =
    view;

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submissionNote, setSubmissionNote] = useState("");
  const [excludeTarget, setExcludeTarget] = useState<string | null>(null);
  const [excludeNote, setExcludeNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [addNote, setAddNote] = useState("");
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const refresh = (message: string) => () => {
    toast.success(message);
    setSubmitOpen(false);
    setExcludeTarget(null);
    setExcludeNote("");
    router.refresh();
  };
  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? "Something went wrong.");

  const submit = useAction(submitGroupReportAction, {
    onSuccess: refresh("Report submitted to the board."),
    onError,
  });
  const setInclusion = useAction(setReportMemberInclusionAction, {
    onSuccess: refresh("Roster updated."),
    onError,
  });
  const acceptAddition = useAction(acceptPendingAdditionAction, {
    onSuccess: refresh("Member added to the report."),
    onError,
  });
  const addManually = useAction(addReportMemberManuallyAction, {
    onSuccess({ data }) {
      toast.success(
        data?.pendingAddition
          ? "Added, and waiting for you to accept them into the submitted roster."
          : "Member added to the report.",
      );
      setAddOpen(false);
      setAddMemberId("");
      setAddNote("");
      router.refresh();
    },
    onError,
  });

  const presentation = REPORT_GROUP_STATUS[reportGroup.status];
  // A closed year is history: it renders exactly as it was signed off, with
  // every control withdrawn rather than disabled, so there is nothing to click
  // that could imply the past is still editable.
  const isLocked =
    !view.isEditable ||
    reportGroup.status === "submitted" ||
    reportGroup.status === "approved";

  const pendingAdditions = roster.filter((row) => row.pendingAddition);
  const confirmed = roster.filter((row) => !row.pendingAddition);
  const currency = reportGroup.currency ?? "CZK";

  // Only the unpaid ones are somebody to chase; a transfer or a member who has
  // left is expected movement, and colouring those red teaches people to
  // ignore the panel.
  const unpaidCount =
    comparison?.missingMembers.filter((member) => member.reason === "unpaid")
      .length ?? 0;

  const daysLeft = report.confirmDueAt ? daysUntil(report.confirmDueAt) : null;

  // Progress is not personal data, so peers are visible to every group admin —
  // rosters are, and stay behind each group's own page.
  const peersDone = peers.filter(
    (peer) => peer.status === "submitted" || peer.status === "approved",
  ).length;

  const canSubmit = !isLocked;

  return (
    <div className="flex flex-col gap-4">
      <YearHeader view={view} locale={locale} />

      {/*
        One card for the whole state of the year: where it stands, why, what it
        is worth, and the single thing to do about it. It replaces a header that
        crammed the same facts into one row with the numbers and the button, and
        three notices stacked underneath repeating half of them.
      */}
      <div className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex max-w-prose flex-col gap-2">
            <Status variant={presentation.variant}>
              <StatusLabel>{presentation.label}</StatusLabel>
            </Status>
            <p className="text-base">
              {describeReportGroupStatus(reportGroup.status, groupName)}
            </p>
            {isLocked ? (
              <p className="text-muted-foreground text-sm">
                {reportGroup.submittedByName
                  ? `Submitted by ${reportGroup.submittedByName}`
                  : "Submitted"}
                {reportGroup.submittedAt
                  ? ` on ${formatDate(reportGroup.submittedAt, locale)}.`
                  : "."}{" "}
                {view.isEditable
                  ? "The roster is frozen. Anyone who pays from now on waits at the bottom of the list for you to add, which sends the report back for re-approval."
                  : "This is how the year was signed off. Nothing here can change any more."}
                {reportGroup.selfApproved
                  ? " It was approved by the person who submitted it."
                  : ""}
              </p>
            ) : null}
            {reportGroup.status === "returned" && reportGroup.returnedReason ? (
              <ReportNotice
                className="mt-1 p-3"
                tone="attention"
                title="Why it came back"
                description={reportGroup.returnedReason}
              />
            ) : null}
          </div>

          {canSubmit ? (
            <div className="flex flex-col items-end gap-1.5">
              <Button
                size="lg"
                onClick={() => setSubmitOpen(true)}
                disabled={reportGroup.memberCount === 0}
              >
                <CheckIcon data-icon="inline-start" />
                Submit {reportGroup.memberCount} member
                {reportGroup.memberCount === 1 ? "" : "s"}
              </Button>
              <p className="text-muted-foreground text-xs">
                {reportGroup.memberCount === 0
                  ? "Nobody to submit yet."
                  : "Locks the roster and sends it to the board."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 divide-x border-t bg-muted/30 sm:grid-cols-3">
          <HeroStat
            value={String(reportGroup.memberCount)}
            label={`${reportGroup.paidCount} paid · ${reportGroup.waivedCount} waived`}
            caption="Members counted"
          />
          <HeroStat
            value={formatFeeAmount(reportGroup.feeTotalCents, currency)}
            caption="Fees collected"
          />
          {report.confirmDueAt ? (
            <HeroStat
              value={formatDate(report.confirmDueAt, locale)}
              caption="Confirm by"
              label={
                daysLeft === null
                  ? undefined
                  : daysLeft < 0
                    ? `${Math.abs(daysLeft)} days overdue`
                    : daysLeft === 0
                      ? "Due today"
                      : `${daysLeft} days left`
              }
              tone={
                daysLeft !== null && daysLeft <= 7 ? "attention" : undefined
              }
            />
          ) : null}
        </div>
      </div>

      {comparison ? (
        <ReportNotice
          icon={<ArrowRightLeftIcon />}
          title={`Compared with ${comparison.previousPeriodLabel} · ${
            comparison.previousMemberCount
          } ${comparison.previousMemberCount === 1 ? "member" : "members"}`}
          description={
            <>
              {comparison.returningCount} returning ·{" "}
              {comparison.newMembers.length} new ·{" "}
              <span
                className={cn(
                  unpaidCount > 0
                    ? "font-medium text-orange-600 dark:text-orange-400"
                    : undefined,
                )}
              >
                {comparison.missingMembers.length} not on this year&rsquo;s list
              </span>
            </>
          }
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={
                comparison.missingMembers.length === 0 &&
                comparison.newMembers.length === 0
              }
              onClick={() => setComparisonOpen(true)}
            >
              <ArrowRightLeftIcon data-icon="inline-start" />
              See what changed
            </Button>
          }
        />
      ) : null}

      <div className="rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-sm">Roster</p>
            <p className="text-muted-foreground text-xs">
              {pendingAdditions.length > 0 && view.isEditable
                ? `${confirmed.length} counted · ${pendingAdditions.length} waiting at the bottom, not counted until you add them`
                : `${confirmed.length} member${
                    confirmed.length === 1 ? "" : "s"
                  } on the ${report.periodLabel} report`}
            </p>
          </div>
          {view.isEditable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addableMembers.length === 0}
                    onClick={() => setAddOpen(true)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Add a member
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {addableMembers.length === 0
                  ? "Everyone in this group is already on the report."
                  : "For somebody who paid outside the system — cash at a meeting, say."}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {confirmed.length === 0 && pendingAdditions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground text-sm"
                >
                  Nobody has confirmed their membership for {report.periodLabel}{" "}
                  yet. Members appear here as their fees are paid.
                </TableCell>
              </TableRow>
            ) : (
              confirmed.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.included ? undefined : "opacity-60"}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{memberName(row)}</span>
                      {row.note ? (
                        <span className="text-muted-foreground text-xs">
                          {row.note}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.included ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {row.included ? row.confirmationBasis : "left out"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatFeeAmount(
                      row.feeAmountCents ?? 0,
                      row.currency ?? currency,
                    )}
                  </TableCell>
                  <TableCell>
                    {isLocked ? null : row.included ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => {
                          setExcludeTarget(row.id);
                          setExcludeNote("");
                        }}
                      >
                        Leave out
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setInclusion.isPending}
                        onClick={() =>
                          setInclusion.execute({
                            reportMemberId: row.id,
                            included: true,
                          })
                        }
                      >
                        Put back
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/*
              People who paid after the roster was locked belong in the roster,
              not in a box above it: the group admin is looking at a list of
              names, and these are names that are missing from it.
            */}
            {view.isEditable
              ? pendingAdditions.map((row) => (
                  <TableRow
                    key={row.id}
                    className="bg-orange-500/[0.04] hover:bg-orange-500/[0.08]"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{memberName(row)}</span>
                        {row.note ? (
                          <span className="text-muted-foreground text-xs">
                            {row.note}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Status variant="warning">
                        <StatusLabel>Waiting · not counted</StatusLabel>
                      </Status>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                      {formatFeeAmount(
                        row.feeAmountCents ?? 0,
                        row.currency ?? currency,
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acceptAddition.isPending}
                        onClick={() =>
                          acceptAddition.execute({ reportMemberId: row.id })
                        }
                      >
                        <UndoIcon data-icon="inline-start" />
                        Add to report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      {peers.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
          <p className="font-medium text-sm">
            {peersDone} of {peers.length} groups have submitted
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {REPORT_GROUP_STATUS_ORDER.map((status) => {
              const count = peers.filter(
                (peer) => peer.status === status,
              ).length;
              if (count === 0) return null;
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 text-muted-foreground text-xs"
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      REPORT_STATUS_TONE[REPORT_GROUP_STATUS[status].variant]
                        .dot,
                    )}
                  />
                  {REPORT_GROUP_STATUS[status].label}
                  <span className="tabular-nums">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <Dialog open={comparisonOpen} onOpenChange={setComparisonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {report.periodLabel} compared with{" "}
              {comparison?.previousPeriodLabel}
            </DialogTitle>
            <DialogDescription>
              Both lists are what was actually reported those years, not who is
              in the group today.
            </DialogDescription>
          </DialogHeader>

          {comparison && comparison.missingMembers.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">
                On {comparison.previousPeriodLabel}&rsquo;s list, not on this
                one
              </p>
              <Table>
                <TableBody>
                  {comparison.missingMembers.map((member, index) => (
                    <TableRow key={member.memberId ?? `missing-${index}`}>
                      <TableCell>
                        <span className="text-sm">{memberName(member)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {member.reason === "moved" ? (
                          <Badge variant="secondary">
                            Now in {member.movedTo}
                          </Badge>
                        ) : member.reason === "left" ? (
                          <Badge variant="secondary">No longer a member</Badge>
                        ) : (
                          <Badge variant="destructive">Has not paid</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {comparison && comparison.newMembers.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">New this year</p>
              <Table>
                <TableBody>
                  {comparison.newMembers.map((member, index) => (
                    <TableRow key={member.memberId ?? `new-${index}`}>
                      <TableCell>
                        <span className="text-sm">{memberName(member)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a member to the {report.periodLabel} report</DialogTitle>
            <DialogDescription>
              For someone who paid outside the system — cash at a meeting, say.
              No payment is recorded and the fee total does not move, so do not
              use this to stand in for a payment that should be entered
              properly. The reason is shown to the board.
              {isLocked && view.isEditable
                ? " This roster is already submitted, so they will wait as a pending addition until you accept them."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Select value={addMemberId} onValueChange={setAddMemberId}>
            <SelectTrigger id="report-add-member">
              <SelectValue placeholder="Choose a member of this group" />
            </SelectTrigger>
            <SelectContent>
              {addableMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {memberName(member)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            placeholder="Why are they being added by hand?"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                addManually.isPending || !addMemberId || !addNote.trim()
              }
              onClick={() =>
                addManually.execute({
                  reportGroupId: reportGroup.id,
                  memberId: addMemberId,
                  note: addNote.trim(),
                })
              }
            >
              {addManually.isPending ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit the {report.periodLabel} report</DialogTitle>
            <DialogDescription>
              You are confirming {reportGroup.memberCount} member
              {reportGroup.memberCount === 1 ? "" : "s"} for{" "}
              {report.periodLabel}. The roster locks and only the board can
              reopen it.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={submissionNote}
            onChange={(e) => setSubmissionNote(e.target.value)}
            placeholder="Anything the board should know (optional)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={submit.isPending}
              onClick={() =>
                submit.execute({
                  reportGroupId: reportGroup.id,
                  submissionNote: submissionNote.trim() || undefined,
                })
              }
            >
              {submit.isPending ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={excludeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExcludeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this member out</DialogTitle>
            <DialogDescription>
              Their payment says they are a member, so the board needs to know
              why they are not in the count.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={excludeNote}
            onChange={(e) => setExcludeNote(e.target.value)}
            placeholder="Reason"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcludeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={setInclusion.isPending || !excludeNote.trim()}
              onClick={() =>
                excludeTarget &&
                setInclusion.execute({
                  reportMemberId: excludeTarget,
                  included: false,
                  note: excludeNote.trim(),
                })
              }
            >
              Leave out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
