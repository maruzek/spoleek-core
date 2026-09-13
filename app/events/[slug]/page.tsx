import { notFound, redirect } from "next/navigation";

import { GuestRsvpForm } from "@/components/app/events/guest-rsvp-form";
import { PublicEventCard } from "@/components/app/events/public-event-card";
import { PublicShell } from "@/components/public/public-shell";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { isRsvpOpen } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getEventCounts, getEventDetail } from "@/server/queries/events";

// Live event data; never prerender.
export const dynamic = "force-dynamic";

/** Public events only. Anything else — draft, org, targeted, missing — is a 404. */
export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getDictionary().events;
  const organization = await getAppOrganization();

  if (!organization) redirect("/setup");

  const row = await getEventDetail(organization.id, { slug }, null);
  if (!row || row.event.visibility !== "public") notFound();

  const counts = row.event.capacity ? await getEventCounts(organization.id, row.event.id) : null;

  return (
    <PublicShell brand={organization.name}>
      <PublicEventCard
        event={row.event}
        ownerName={row.ownerName ?? organization.name}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={counts}
        t={t}
        rsvp={
          <GuestRsvpForm
            eventSlug={row.event.slug}
            open={isRsvpOpen(row.event, new Date())}
            maxGuests={row.event.maxGuestsPerResponse}
            rsvpBaseUrl={buildAbsoluteAppUrl("/events/rsvp/")}
          />
        }
      />
    </PublicShell>
  );
}
