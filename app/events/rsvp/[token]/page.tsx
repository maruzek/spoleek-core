import { redirect } from "next/navigation";

import { EventRsvp } from "@/components/app/events/event-rsvp";
import { PublicEventCard } from "@/components/app/events/public-event-card";
import { PublicEventForms } from "@/components/app/forms/public-event-forms";
import { PublicShell } from "@/components/public/public-shell";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getViewerSession } from "@/server/queries/auth";
import { getResponderView, resolveTokenResponder } from "@/server/queries/responder";

export const dynamic = "force-dynamic";

/**
 * A personal RSVP link. Renders the event for any visibility because the
 * token *is* the invitation. A signed-in member opening their own link is
 * sent to the portal; anyone else — including a member opening somebody
 * else's link — answers as the token's holder.
 */
export default async function TokenRsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dict = getDictionary();
  const t = dict.events;
  const organization = await getAppOrganization();

  if (!organization) redirect("/setup");

  // A dead link gets the plain page. A closed RSVP (deadline passed, event
  // over, cancelled) still shows the event so the holder can see why.
  const resolved = await resolveTokenResponder(organization.id, token, new Date());
  if (!resolved) {
    return <InvalidLink brand={organization.name} title={t.token.invalidTitle} body={t.token.invalidBody} />;
  }
  const { responder } = resolved;

  // Own link while signed in → the portal is the better place to answer.
  if (responder.memberUserId) {
    const session = await getViewerSession();
    if (session?.user.id === responder.memberUserId) redirect(`/portal/events/${resolved.event.slug}`);
  }

  const view = await getResponderView(organization.id, resolved, responder);

  return (
    <PublicShell brand={organization.name}>
      <PublicEventCard
        event={view.event}
        ownerName={view.ownerName ?? organization.name}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={view.counts}
        note={t.token.answeringAs(responder.displayName)}
        t={t}
        forms={<PublicEventForms items={view.forms} hrefFor={(id) => `/events/rsvp/${token}/forms/${id}`} t={dict.forms} />}
        rsvp={<EventRsvp target={{ kind: "token", token }} view={view.rsvp} />}
      />
    </PublicShell>
  );
}

function InvalidLink({ brand, title, body }: { brand: string; title: string; body: string }) {
  return (
    <PublicShell brand={brand} width="narrow">
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </PublicShell>
  );
}
