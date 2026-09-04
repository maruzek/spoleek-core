"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmailActivityTable } from "@/components/app/emails/email-activity-table";
import { EmailDetailSheet } from "@/components/app/emails/email-detail-sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  EmailActivityDetail,
  EmailActivityRow,
} from "@/server/queries/email-activity";

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "problem";
}) {
  return (
    <Card className={tone === "problem" ? "border-destructive/20" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function EmailAdmin({
  activities,
  selectedActivity,
}: {
  activities: EmailActivityRow[];
  selectedActivity: EmailActivityDetail | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * The detail sheet is server-driven off `?email=`, so a link to one troubled
   * email can be pasted into a support thread and open the same view.
   */
  const setSelectedEmail = useCallback(
    (emailId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (emailId) {
        params.set("email", emailId);
      } else {
        params.delete("email");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  // Counted across the whole org rather than the current filter, so the cards
  // stay a stable health read while the table below is being narrowed.
  const summary = useMemo(
    () =>
      activities.reduce(
        (acc, activity) => {
          acc.total += 1;
          acc[activity.currentStatus] += 1;

          if (activity.hasProblem) {
            acc.problems += 1;
          }

          return acc;
        },
        {
          total: 0,
          sent: 0,
          delivered: 0,
          bounced: 0,
          complained: 0,
          suppressed: 0,
          failed: 0,
          problems: 0,
        },
      ),
    [activities],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Sent" value={summary.sent} />
        <SummaryCard label="Delivered" value={summary.delivered} />
        <SummaryCard label="Problems" value={summary.problems} tone="problem" />
        <SummaryCard
          label="Suppressed"
          value={summary.suppressed}
          tone="problem"
        />
        <SummaryCard label="Bounced" value={summary.bounced} tone="problem" />
        <SummaryCard
          label="Complained"
          value={summary.complained}
          tone="problem"
        />
        <SummaryCard label="Failed" value={summary.failed} tone="problem" />
        <SummaryCard label="Total records" value={summary.total} />
      </div>

      <EmailActivityTable
        activities={activities}
        scope="organization"
        onOpenDetail={setSelectedEmail}
      />

      <EmailDetailSheet
        activity={selectedActivity}
        open={selectedActivity != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEmail(null);
          }
        }}
      />
    </div>
  );
}
