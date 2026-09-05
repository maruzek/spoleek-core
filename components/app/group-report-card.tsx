"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ClockIcon,
  PlusIcon,
  UndoIcon,
} from "lucide-react";

import { formatFeeAmount } from "@/lib/payments";
import { PERIOD_DATE_TIMEZONE } from "@/lib/membership-period";
import {
  REPORT_GROUP_STATUS,
  daysUntil,
  describeReportGroupStatus,
} from "@/lib/membership-report-status";
import type { GroupReportView } from "@/server/queries/membership-reports";
import {
  acceptPendingAdditionAction,
  addReportMemberManuallyAction,
  setReportMemberInclusionAction,
  submitGroupReportAction,
} from "@/server/actions/membership-reports";
import { ReportPeriodPicker } from "@/components/app/report-period-picker";
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

export function GroupReportCard({
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">
              Membership year {report.periodLabel}
            </p>
            {!view.isEditable ? (
              <Badge variant="outline">Closed</Badge>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatDate(report.periodStart, locale)} –{" "}
              {formatDate(report.periodEnd, locale)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Status variant={presentation.variant}>
              <StatusLabel>{presentation.label}</StatusLabel>
            </Status>
            <span className="text-muted-foreground text-sm">
              {describeReportGroupStatus(reportGroup.status, groupName)}
            </span>
          </div>
          {report.confirmDueAt ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ClockIcon className="size-3.5" />
              Confirm by {formatDate(report.confirmDueAt, locale)}
              {daysLeft !== null ? (
                <span
                  className={
                    daysLeft < 0
                      ? "font-medium text-destructive"
                      : daysLeft <= 7
                        ? "font-medium text-orange-600 dark:text-orange-400"
                        : ""
                  }
                >
                  {daysLeft < 0
                    ? `· ${Math.abs(daysLeft)} days overdue`
                    : daysLeft === 0
                      ? "· today"
                      : `· ${daysLeft} days left`}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-6">
          <ReportPeriodPicker
            periods={view.periods}
            currentReportId={report.id}
          />
          <div className="flex flex-col">
            <span className="font-semibold text-2xl tabular-nums">
              {reportGroup.memberCount}
            </span>
            <span className="text-muted-foreground text-xs">
              {reportGroup.paidCount} paid · {reportGroup.waivedCount} waived
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-2xl tabular-nums">
              {formatFeeAmount(reportGroup.feeTotalCents, currency)}
            </span>
            <span className="text-muted-foreground text-xs">collected</span>
          </div>
        </div>
      </div>

      {reportGroup.status === "returned" && reportGroup.returnedReason ? (
        <Alert variant="destructive">
          <AlertTitle>The board sent this back</AlertTitle>
          <AlertDescription>{reportGroup.returnedReason}</AlertDescription>
        </Alert>
      ) : null}

      {isLocked ? (
        <Alert>
          <AlertTitle>
            {!view.isEditable
              ? `The ${report.periodLabel} report is closed`
              : reportGroup.status === "approved"
                ? "Approved by the board"
                : "Submitted and locked"}
          </AlertTitle>
          <AlertDescription>
            {reportGroup.submittedByName
              ? `Submitted by ${reportGroup.submittedByName}`
              : "Submitted"}
            {reportGroup.submittedAt
              ? ` on ${formatDate(reportGroup.submittedAt, locale)}.`
              : "."}{" "}
            {view.isEditable
              ? "The roster is frozen. Members who pay from now on appear below for you to add, which sends the report back for re-approval."
              : "This is how the year was signed off. Nothing here can change any more."}
            {reportGroup.selfApproved
              ? " This report was approved by the person who submitted it."
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingAdditions.length > 0 && view.isEditable ? (
        <div className="flex flex-col gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <p className="font-medium text-sm">
            {pendingAdditions.length} member
            {pendingAdditions.length === 1 ? "" : "s"} confirmed after you
            submitted
          </p>
          <p className="text-muted-foreground text-sm">
            They are not counted yet. Adding one sends the report back to the
            board so the numbers they approved stay honest.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {pendingAdditions.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">{memberName(row)}</span>
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
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {comparison ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-sm">
              Compared with {comparison.previousPeriodLabel} ·{" "}
              {comparison.previousMemberCount}{" "}
              {comparison.previousMemberCount === 1 ? "member" : "members"}
            </p>
            <p className="text-muted-foreground text-sm">
              {comparison.returningCount} returning · {comparison.newMembers.length}{" "}
              new ·{" "}
              <span
                className={
                  unpaidCount > 0 ? "text-destructive font-medium" : undefined
                }
              >
                {comparison.missingMembers.length} not on this year&rsquo;s list
              </span>
            </p>
          </div>
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
        </div>
      ) : null}

      {view.isEditable ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Somebody who paid outside the system can be added by hand.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={addableMembers.length === 0}
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Add a member
          </Button>
        </div>
      ) : null}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Confirmed by</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {confirmed.length === 0 ? (
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
          </TableBody>
        </Table>
      </div>

      {isLocked ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Submitting locks the roster and sends it to the board.
          </p>
          <Button
            onClick={() => setSubmitOpen(true)}
            disabled={reportGroup.memberCount === 0}
          >
            <CheckIcon data-icon="inline-start" />
            Submit {reportGroup.memberCount} member
            {reportGroup.memberCount === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      {peers.length > 1 ? (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <p className="font-medium text-sm">
            {peersDone} of {peers.length} groups have submitted
          </p>
          <div className="flex flex-wrap gap-2">
            {peers.map((peer) => {
              const peerStatus = REPORT_GROUP_STATUS[peer.status];
              return (
                <Status
                  key={peer.groupId ?? peer.groupName}
                  variant={peerStatus.variant}
                >
                  <StatusLabel>
                    {peer.groupName} · {peer.memberCount}
                  </StatusLabel>
                </Status>
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
