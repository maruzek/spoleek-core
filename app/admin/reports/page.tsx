import { forbidden } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { CloseMembershipReportButton } from "@/components/app/close-membership-report-button";
import { MembershipReportBoard } from "@/components/app/membership-report-board";
import { OpenMembershipReportButton } from "@/components/app/open-membership-report-button";
import { ReportPeriodPicker } from "@/components/app/report-period-picker";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAdminAccess } from "@/server/queries/access";
import { getFeeManagingCategory } from "@/server/lib/membership-report";
import { getBoardReportView } from "@/server/queries/membership-reports";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  // Board-only. Group admins work their own report through the group page and
  // must never reach the org-wide roster view.
  const { organization } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  if (!organization.membershipReportEnabled) {
    forbidden();
  }

  const { report: requestedReportId } = await searchParams;

  const [view, category] = await Promise.all([
    getBoardReportView(organization.id, requestedReportId),
    getFeeManagingCategory(organization.id),
  ]);

  return (
    <AppPage
      eyebrow="Administration"
      title="Yearly member report"
      description={
        category
          ? `Each group in ${category.name} confirms its paid members, then the board reviews and approves them.`
          : "Each group confirms its paid members, then the board reviews and approves them."
      }
      actions={
        view ? (
          <div className="flex items-center gap-2">
            <ReportPeriodPicker
              periods={view.periods}
              currentReportId={view.report.id}
            />
            <CloseMembershipReportButton
              reportId={view.report.id}
              periodLabel={view.report.periodLabel}
              isClosed={view.report.status === "closed"}
              unapprovedGroups={
                view.totals.groupCount - view.totals.approvedCount
              }
              unassignedMembers={view.unassigned.length}
            />
            {view.report.status === "closed" ? null : (
              <OpenMembershipReportButton hasReport />
            )}
          </div>
        ) : null
      }
    >
      {view ? (
        <MembershipReportBoard
          view={view}
          categoryId={category?.id ?? null}
          locale={organization.locale}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No report has been opened yet</EmptyTitle>
            <EmptyDescription>
              Opening a report creates one row per group in{" "}
              {category?.name ?? "the fee-managing category"} and fills it with
              everyone who has already paid this year. Groups confirm from their
              own page.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <OpenMembershipReportButton hasReport={false} />
          </EmptyContent>
        </Empty>
      )}
    </AppPage>
  );
}
