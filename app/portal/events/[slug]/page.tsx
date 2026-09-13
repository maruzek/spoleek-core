import { notFound } from "next/navigation";

import { PortalEventDetail } from "@/components/app/events/portal-event-detail";
import { PortalEventRsvp } from "@/components/app/events/portal-event-rsvp";
import { isRsvpOpen } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getEventCounts, getEventDetail, getMemberResponse } from "@/server/queries/events";

export default async function PortalEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;

  const row = await getEventDetail(organization.id, { slug }, { memberId: member.id });
  if (!row) notFound();

  const [response, counts] = await Promise.all([
    getMemberResponse(organization.id, row.event.id, member.id),
    getEventCounts(organization.id, row.event.id),
  ]);

  // Not wrapped in `AppPage`: the event header is the page title, same as
  // the admin record.
  return (
    <div className="flex flex-1 flex-col pb-8">
      <PortalEventDetail
        event={row.event}
        ownerName={row.ownerName ?? t.wholeOrganization}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={counts}
        response={response ? { answer: response.answer, standing: response.standing } : null}
        t={t}
        rsvp={
          <PortalEventRsvp
            eventId={row.event.id}
            open={isRsvpOpen(row.event, new Date())}
            maxGuests={row.event.maxGuestsPerResponse}
            current={
              response ? { answer: response.answer, guestCount: response.guestCount, standing: response.standing } : null
            }
          />
        }
      />
    </div>
  );
}
