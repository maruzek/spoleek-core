import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupDetail } from "@/components/app/group-detail";
import { requireGroupManagementAccess } from "@/server/queries/access";
import { getAppOrganization } from "@/server/queries/app";
import { getGroupDetailData } from "@/server/queries/groups";

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ categoryId: string; groupId: string }>;
}) {
  const { categoryId, groupId } = await params;
  const access = await requireGroupManagementAccess(groupId);
  const [detail, organization] = await Promise.all([
    getGroupDetailData(access.organization.id, groupId),
    getAppOrganization(),
  ]);

  if (!detail || detail.group.categoryId !== categoryId) {
    notFound();
  }

  const orgFeeDefaults = organization
    ? {
        renewalMonth: organization.membershipRenewalMonth,
        renewalDay: organization.membershipRenewalDay,
        feeAmount: organization.membershipFeeAmount,
        feeCurrency: organization.membershipFeeCurrency,
        feeBankAccount: organization.membershipFeeBankAccount,
      }
    : undefined;

  return (
    <AppPage
      eyebrow="Groups"
      title={detail.group.name}
      description="Manage the member roster, delegated admins, and settings for this group."
    >
      <GroupDetail
        group={detail.group}
        members={detail.members}
        admins={detail.admins}
        assignableMembers={detail.assignableMembers}
        orgFeeDefaults={orgFeeDefaults}
      />
    </AppPage>
  );
}
