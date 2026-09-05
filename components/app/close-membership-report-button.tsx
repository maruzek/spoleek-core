"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { LockIcon, UnlockIcon } from "lucide-react";

import {
  closeMembershipReportAction,
  reopenMembershipReportAction,
} from "@/server/actions/membership-reports";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/**
 * Closes the year, or reopens a closed one.
 *
 * Both are deliberate, named actions with a confirmation. Closing used to be
 * reachable only by SQL, and reopening happened by accident whenever somebody
 * refreshed from payments.
 */
export function CloseMembershipReportButton({
  reportId,
  periodLabel,
  isClosed,
  unapprovedGroups,
  unassignedMembers,
}: {
  reportId: string;
  periodLabel: string;
  isClosed: boolean;
  unapprovedGroups: number;
  unassignedMembers: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const isIncomplete = unapprovedGroups > 0 || unassignedMembers > 0;

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? "Something went wrong.");

  const closeReport = useAction(closeMembershipReportAction, {
    onSuccess({ data }) {
      toast.success(`${data?.periodLabel ?? "The report"} is closed.`);
      setOpen(false);
      setAcknowledged(false);
      router.refresh();
    },
    onError,
  });

  const reopenReport = useAction(reopenMembershipReportAction, {
    onSuccess({ data }) {
      toast.success(`${data?.periodLabel ?? "The report"} is open again.`);
      setOpen(false);
      router.refresh();
    },
    onError,
  });

  const isPending = closeReport.isPending || reopenReport.isPending;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setAcknowledged(false);
          setOpen(true);
        }}
      >
        {isClosed ? (
          <UnlockIcon data-icon="inline-start" />
        ) : (
          <LockIcon data-icon="inline-start" />
        )}
        {isClosed ? "Reopen the year" : "Close the year"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isClosed ? `Reopen ${periodLabel}?` : `Close ${periodLabel}?`}
            </DialogTitle>
            <DialogDescription>
              {isClosed
                ? "The rosters become editable again and the board can approve and send back. Anything you change from here on changes a year that was already signed off."
                : "The rosters become permanent. Groups can no longer change theirs, the board can no longer approve or send back, and refreshing from payments will refuse to touch it."}
            </DialogDescription>
          </DialogHeader>

          {!isClosed && isIncomplete ? (
            <div className="flex flex-col gap-3">
              <ul className="text-destructive list-disc pl-5 text-sm">
                {unapprovedGroups > 0 ? (
                  <li>
                    {unapprovedGroups} group
                    {unapprovedGroups === 1 ? " is" : "s are"} not approved.
                  </li>
                ) : null}
                {unassignedMembers > 0 ? (
                  <li>
                    {unassignedMembers} confirmed member
                    {unassignedMembers === 1 ? " is" : "s are"} in no group, so
                    the total is short by that many.
                  </li>
                ) : null}
              </ul>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="acknowledge-incomplete"
                  checked={acknowledged}
                  onCheckedChange={(value) => setAcknowledged(value === true)}
                />
                <Label
                  htmlFor="acknowledge-incomplete"
                  className="text-sm font-normal leading-snug"
                >
                  Close {periodLabel} anyway. I know these will stay this way in
                  the record.
                </Label>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={isClosed ? "default" : "destructive"}
              disabled={
                isPending || (!isClosed && isIncomplete && !acknowledged)
              }
              onClick={() =>
                isClosed
                  ? reopenReport.execute({ reportId })
                  : closeReport.execute({
                      reportId,
                      acknowledgeIncomplete: acknowledged,
                    })
              }
            >
              {isPending
                ? "Working…"
                : isClosed
                  ? "Reopen the year"
                  : "Close the year"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
