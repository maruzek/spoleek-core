import { AppPage } from "@/components/app/app-page";
import { PortalFormsList } from "@/components/app/forms/portal-forms-list";
import { getDictionary } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listFormsForViewer } from "@/server/queries/forms";

export default async function PortalFormsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().forms;
  const buckets = await listFormsForViewer({ orgId: organization.id, memberId: member.id });

  return (
    <AppPage eyebrow={t.portalEyebrow} title={t.portalTitle} description={t.portalDescription}>
      <PortalFormsList pending={buckets.pending} submitted={buckets.submitted} />
    </AppPage>
  );
}
