"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmailActivityTable } from "@/components/app/emails/email-activity-table";
import { EmailDetailSheet } from "@/components/app/emails/email-detail-sheet";
import type {
  EmailActivityDetail,
  EmailActivityRow,
} from "@/server/queries/email-activity";

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

  return (
    <div className="flex flex-col gap-6">
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
