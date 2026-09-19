import { AppPage } from "@/components/app/app-page";
import { PortalEventsAgenda } from "@/components/app/events/portal-events-agenda";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listEventsForViewer } from "@/server/queries/events";
import { listFormsForViewer } from "@/server/queries/forms";

export default async function PortalEventsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;
  const [buckets, forms] = await Promise.all([
    listEventsForViewer({ orgId: organization.id, memberId: member.id }),
    listFormsForViewer({ orgId: organization.id, memberId: member.id }),
  ]);
  const pendingForms: Record<string, number> = {};
  for (const item of forms.pending) {
    if (item.pending && item.form.eventId) {
      pendingForms[item.form.eventId] = (pendingForms[item.form.eventId] ?? 0) + 1;
    }
  }

  return (
    <AppPage eyebrow={t.portalEyebrow} title={t.portalTitle} description={t.portalDescription} width="split">
      <PortalEventsAgenda
        upcoming={[...buckets.invited, ...buckets.open]}
        past={buckets.past}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        pendingForms={pendingForms}
      />
    </AppPage>
  );
}
