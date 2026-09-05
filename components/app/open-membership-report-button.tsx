"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { PlayIcon } from "lucide-react";

import { openMembershipReportAction } from "@/server/actions/membership-reports";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Opens (or reopens) the report for the current membership year.
 *
 * The deadline is not asked for here — it comes from Settings → Membership, so
 * that one organization-wide date is not quietly re-set every time somebody
 * opens a report.
 */
export function OpenMembershipReportButton({
  hasReport,
}: {
  hasReport: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const openReport = useAction(openMembershipReportAction, {
    onSuccess({ data }) {
      toast.success(
        data
          ? `Report ${data.periodLabel} opened with ${data.groupsCreated} group${
              data.groupsCreated === 1 ? "" : "s"
            } and ${data.membersBackfilled} confirmed member${
              data.membersBackfilled === 1 ? "" : "s"
            }.`
          : "Report opened.",
      );
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not open the report.");
    },
  });

  return (
    <>
      <Button
        size={hasReport ? "sm" : "default"}
        variant={hasReport ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        <PlayIcon data-icon="inline-start" />
        {hasReport ? "Refresh from payments" : "Open this year's report"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasReport ? "Refresh the report" : "Open this year's report"}
            </DialogTitle>
            <DialogDescription>
              {hasReport
                ? "Adds any group created since the report opened and pulls in members who have paid. Rosters that groups have already submitted are not touched."
                : "Creates one row per group in the fee-managing category and fills each with the members who have already paid this year. Groups start unconfirmed — nothing is submitted on their behalf."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={openReport.isPending}
              onClick={() => openReport.execute({})}
            >
              {openReport.isPending ? "Working…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
