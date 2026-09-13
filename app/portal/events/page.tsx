import { AppPage } from "@/components/app/app-page";
import { EventListSection } from "@/components/app/events/event-list-section";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listEventsForViewer } from "@/server/queries/events";

export default async function PortalEventsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;
  const locale = orgFormatLocale(organization.locale);
  const buckets = await listEventsForViewer({ orgId: organization.id, memberId: member.id });

  return (
    <AppPage eyebrow={t.portalEyebrow} title={t.portalTitle} description={t.portalDescription}>
      <div className="flex flex-col gap-8">
        <EventListSection title={t.sections.invited} empty={t.emptyInvited} items={buckets.invited} locale={locale} timeZone={organization.timezone} t={t} />
        <EventListSection title={t.sections.open} empty={t.emptyOpen} items={buckets.open} locale={locale} timeZone={organization.timezone} t={t} />
        <EventListSection title={t.sections.past} empty={t.emptyPast} items={buckets.past} locale={locale} timeZone={organization.timezone} t={t} />
      </div>
    </AppPage>
  );
}
