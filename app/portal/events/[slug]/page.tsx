import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { AppPage } from "@/components/app/app-page";
import { EventDetail } from "@/components/app/events/event-detail";
import { PortalEventRsvp } from "@/components/app/events/portal-event-rsvp";
import { Button } from "@/components/ui/button";
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

  return (
    <AppPage
      eyebrow={t.portalEyebrow}
      title={row.event.title}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/events">
            <ArrowLeftIcon data-icon="inline-start" />
            {t.portalTitle}
          </Link>
        </Button>
      }
    >
      <div className="max-w-3xl">
        <EventDetail
          event={row.event}
          ownerName={row.ownerName ?? t.wholeOrganization}
          locale={orgFormatLocale(organization.locale)}
          timeZone={organization.timezone}
          counts={row.event.capacity ? counts : null}
          rsvp={
            <PortalEventRsvp
              eventId={row.event.id}
              open={isRsvpOpen(row.event, new Date())}
              maxGuests={row.event.maxGuestsPerResponse}
              current={response ? { answer: response.answer, guestCount: response.guestCount, standing: response.standing } : null}
            />
          }
        />
      </div>
    </AppPage>
  );
}
