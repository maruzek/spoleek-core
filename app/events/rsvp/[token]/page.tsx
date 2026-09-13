import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { EventDetail } from "@/components/app/events/event-detail";
import { TokenEventRsvp } from "@/components/app/events/token-event-rsvp";
import { PublicShell } from "@/components/public/public-shell";
import { isRsvpOpen, isTokenValid } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import { eventAudience, eventResponses, tenantMembers } from "@/server/db/schema";
import { findTokenHolder } from "@/server/lib/events/tokens";
import { getAppOrganization } from "@/server/queries/app";
import { getViewerSession } from "@/server/queries/auth";
import { getEventById, getEventCounts, getMemberResponse } from "@/server/queries/events";

export const dynamic = "force-dynamic";

/**
 * A personal RSVP link. Renders the event for any visibility because the
 * token *is* the invitation. A signed-in member opening their own link is
 * sent to the portal; anyone else — including a member opening somebody
 * else's link — answers as the token's holder.
 */
export default async function TokenRsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = getDictionary().events;
  const organization = await getAppOrganization();

  if (!organization) redirect("/setup");

  const now = new Date();
  const holder = await findTokenHolder(token);
  const valid = holder ? isTokenValid({ event: holder.event, token: holder.token, now }) : null;

  // A dead link gets the plain page. A closed RSVP (deadline passed, event
  // over, cancelled) still shows the event so the holder can see why.
  const dead =
    !holder ||
    holder.event.orgId !== organization.id ||
    !valid ||
    (!valid.open &&
      (valid.reason === "token_expired" || valid.reason === "event_deleted" || valid.reason === "draft"));

  if (dead) {
    return <InvalidLink brand={organization.name} title={t.token.invalidTitle} body={t.token.invalidBody} />;
  }

  // Own link while signed in → the portal is the better place to answer.
  if (holder.token.memberId) {
    const session = await getViewerSession();
    if (session) {
      const [member] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.id, holder.token.memberId), eq(tenantMembers.userId, session.user.id)))
        .limit(1);
      if (member) redirect(`/portal/events/${holder.event.slug}`);
    }
  }

  const [row, counts, current, holderName] = await Promise.all([
    getEventById(organization.id, holder.event.id),
    holder.event.capacity ? getEventCounts(organization.id, holder.event.id) : null,
    holder.token.memberId
      ? getMemberResponse(organization.id, holder.event.id, holder.token.memberId)
      : db
          .select()
          .from(eventResponses)
          .where(
            and(
              eq(eventResponses.eventId, holder.event.id),
              sql`lower(${eventResponses.guestEmail}) = lower(${holder.token.externalEmail})`,
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null),
    holder.token.memberId
      ? db
          .select({ firstName: tenantMembers.firstName, lastName: tenantMembers.lastName })
          .from(tenantMembers)
          .where(eq(tenantMembers.id, holder.token.memberId))
          .limit(1)
          .then((rows) => (rows[0] ? getMemberDisplayName(rows[0]) : null))
      : db
          .select({ name: eventAudience.externalName })
          .from(eventAudience)
          .where(
            and(
              eq(eventAudience.eventId, holder.event.id),
              eq(eventAudience.kind, "external"),
              sql`lower(${eventAudience.externalEmail}) = lower(${holder.token.externalEmail})`,
            ),
          )
          .limit(1)
          .then((rows) => rows[0]?.name ?? holder.token.externalEmail),
  ]);

  const open = isRsvpOpen(holder.event, now);

  return (
    <PublicShell brand={organization.name}>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-background p-6 shadow-sm md:p-8">
        <p className="mb-4 text-sm text-muted-foreground">{t.token.answeringAs(holderName ?? "")}</p>
        <EventDetail
          event={holder.event}
          ownerName={row?.ownerName ?? organization.name}
          locale={orgFormatLocale(organization.locale)}
          timeZone={organization.timezone}
          counts={counts}
          rsvp={
            <TokenEventRsvp
              token={token}
              open={open}
              maxGuests={holder.event.maxGuestsPerResponse}
              current={current ? { answer: current.answer, guestCount: current.guestCount, standing: current.standing } : null}
            />
          }
        />
      </div>
    </PublicShell>
  );
}

function InvalidLink({ brand, title, body }: { brand: string; title: string; body: string }) {
  return (
    <PublicShell brand={brand} width="narrow">
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </PublicShell>
  );
}
