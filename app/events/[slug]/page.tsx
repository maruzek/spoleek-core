import { notFound, redirect } from "next/navigation";

import { GuestRsvpForm } from "@/components/app/events/guest-rsvp-form";
import { PublicEventCard } from "@/components/app/events/public-event-card";
import { PublicEventForms } from "@/components/app/forms/public-event-forms";
import { PublicShell } from "@/components/public/public-shell";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { isRsvpOpen } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getEventCounts, getEventDetail } from "@/server/queries/events";
import { listFormsForEvent } from "@/server/queries/forms";

// Live event data; never prerender.
export const dynamic = "force-dynamic";

/** Public events only. Anything else — draft, org, targeted, missing — is a 404. */
export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dict = getDictionary();
  const t = dict.events;
  const organization = await getAppOrganization();

  if (!organization) redirect("/setup");

  const row = await getEventDetail(organization.id, { slug }, null);
  if (!row || row.event.visibility !== "public") notFound();

  const [counts, forms] = await Promise.all([
    row.event.capacity ? getEventCounts(organization.id, row.event.id) : null,
    // Nobody is identified yet, so no submission state; the list is just the open forms.
    listFormsForEvent(organization.id, row.event, { kind: "guest", guestEmail: "", guestName: "", rsvpAnswer: null }),
  ]);
  const afterRsvp = forms.find((item) => item.placement === "inline_after_rsvp") ?? null;

  return (
    <PublicShell brand={organization.name}>
      <PublicEventCard
        event={row.event}
        ownerName={row.ownerName ?? organization.name}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={counts}
        t={t}
        forms={<PublicEventForms items={forms} hrefFor={(id) => `/events/${row.event.slug}/forms/${id}`} t={dict.forms} />}
        rsvp={
          <GuestRsvpForm
            eventSlug={row.event.slug}
            open={isRsvpOpen(row.event, new Date())}
            maxGuests={row.event.maxGuestsPerResponse}
            rsvpBaseUrl={buildAbsoluteAppUrl("/events/rsvp/")}
            afterRsvpForm={afterRsvp ? { id: afterRsvp.form.id, title: afterRsvp.form.title, required: afterRsvp.form.required } : null}
          />
        }
      />
    </PublicShell>
  );
}
