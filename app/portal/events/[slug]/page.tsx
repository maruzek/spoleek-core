import { notFound } from "next/navigation";

import { EventRsvp } from "@/components/app/events/event-rsvp";
import { PortalEventDetail } from "@/components/app/events/portal-event-detail";
import { PortalEventForms } from "@/components/app/forms/portal-event-forms";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { canManageEvent, requireCurrentMemberAccess } from "@/server/queries/access";
import { getEventDetail } from "@/server/queries/events";
import { getResponderView, memberResponder } from "@/server/queries/responder";
import { requireViewer } from "@/server/queries/viewer";

export default async function PortalEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;

  const row = await getEventDetail(organization.id, { slug }, { memberId: member.id });
  if (!row) notFound();

  const [view, canManage] = await Promise.all([
    getResponderView(organization.id, row, memberResponder(member)),
    canManageEvent(viewer, row.event),
  ]);

  // Not wrapped in `AppPage`: the event header is the page title, same as
  // the admin record.
  return (
    <div className="flex flex-1 flex-col pb-8">
      <PortalEventDetail
        event={view.event}
        ownerName={view.ownerName ?? t.wholeOrganization}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={view.counts}
        response={view.rsvp.current}
        t={t}
        forms={<PortalEventForms items={view.forms.map((item) => ({ ...item, event: view.event }))} />}
        manageHref={canManage ? `/admin/events/${view.event.id}` : null}
        rsvp={<EventRsvp target={{ kind: "member", eventId: view.event.id }} view={view.rsvp} />}
      />
    </div>
  );
}
