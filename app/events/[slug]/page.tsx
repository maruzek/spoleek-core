import { notFound, redirect } from "next/navigation";

import { GuestRsvpForm } from "@/components/app/events/guest-rsvp-form";
import { PublicEventCard } from "@/components/app/events/public-event-card";
import { PublicEventForms } from "@/components/app/forms/public-event-forms";
import { PublicShell } from "@/components/public/public-shell";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getEventDetail } from "@/server/queries/events";
import { getResponderView } from "@/server/queries/responder";

// Live event data; never prerender.
export const dynamic = "force-dynamic";

/** Public events only. Anything else — draft, org, targeted, missing — is a 404. */
export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dict = getDictionary();
  const t = dict.events;
  const organization = await getAppOrganization();

  if (!organization) redirect("/setup");

  // With no responder, `getEventDetail` returns public events only.
  const row = await getEventDetail(organization.id, { slug }, null);
  if (!row) notFound();

  const view = await getResponderView(organization.id, row, { kind: "guest" });

  return (
    <PublicShell brand={organization.name}>
      <PublicEventCard
        event={view.event}
        ownerName={view.ownerName ?? organization.name}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={view.counts}
        t={t}
        forms={<PublicEventForms items={view.forms} hrefFor={(id) => `/events/${view.event.slug}/forms/${id}`} t={dict.forms} />}
        rsvp={
          <GuestRsvpForm
            eventSlug={view.event.slug}
            view={view.rsvp}
            rsvpBaseUrl={buildAbsoluteAppUrl("/events/rsvp/")}
          />
        }
      />
    </PublicShell>
  );
}
