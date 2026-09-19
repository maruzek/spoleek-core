import { AppPage } from "@/components/app/app-page";
import { PortalFormsList } from "@/components/app/forms/portal-forms-list";
import { getDictionary } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { listFormsForViewer } from "@/server/queries/forms";

export default async function PortalFormsPage() {
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().forms;
  const buckets = await listFormsForViewer({ orgId: organization.id, memberId: member.id });

  return (
    <AppPage eyebrow={t.portalEyebrow} title={t.portalTitle} description={t.portalDescription} width="content">
      <PortalFormsList pending={buckets.pending} submitted={buckets.submitted} />
    </AppPage>
  );
}
