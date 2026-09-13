import { AppPage } from "@/components/app/app-page";
import { PortalEventsAgenda } from "@/components/app/events/portal-events-agenda";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listEventsForViewer } from "@/server/queries/events";

export default async function PortalEventsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;
  const buckets = await listEventsForViewer({ orgId: organization.id, memberId: member.id });

  return (
    <AppPage eyebrow={t.portalEyebrow} title={t.portalTitle} description={t.portalDescription}>
      <PortalEventsAgenda
        upcoming={[...buckets.invited, ...buckets.open]}
        past={buckets.past}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
      />
    </AppPage>
  );
}
