import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { PublicFormCard } from "@/components/app/forms/public-form-card";
import { PublicFormFiller } from "@/components/app/forms/public-form-filler";
import { PublicShell } from "@/components/public/public-shell";
import { isTokenValid } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import { findTokenHolder } from "@/server/lib/events/tokens";
import { getAppOrganization } from "@/server/queries/app";
import { getViewerSession } from "@/server/queries/auth";
import { getFormById, getFormForFiller, getGuestRsvpAnswer, getMemberRsvpAnswer } from "@/server/queries/forms";

export const dynamic = "force-dynamic";

/**
 * A personal-link filler. Identity comes from the token, so there is no name
 * or email to type. A signed-in member opening their own link is sent to the
 * portal, where the form can also write to their profile.
 */
export default async function TokenFormPage({ params }: { params: Promise<{ token: string; formId: string }> }) {
  const { token, formId } = await params;
  const t = getDictionary().forms;
  const organization = await getAppOrganization();
  if (!organization) redirect("/setup");

  const holder = await findTokenHolder(token);
  const valid = holder ? isTokenValid({ event: holder.event, token: holder.token, now: new Date() }) : null;
  const dead =
    !holder ||
    holder.event.orgId !== organization.id ||
    !valid ||
    (!valid.open && (valid.reason === "token_expired" || valid.reason === "event_deleted" || valid.reason === "draft"));

  if (dead) {
    return (
      <PublicShell brand={organization.name} width="narrow">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <h1 className="font-heading text-xl font-semibold">{t.token.invalidTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.token.invalidBody}</p>
        </div>
      </PublicShell>
    );
  }

  if (holder.token.memberId) {
    const session = await getViewerSession();
    if (session) {
      const [member] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.id, holder.token.memberId), eq(tenantMembers.userId, session.user.id)))
        .limit(1);
      if (member) redirect(`/portal/forms/${formId}`);
    }
  }

  const form = await getFormById(organization.id, formId);
  if (!form || form.eventId !== holder.event.id || form.status === "draft") notFound();

  const rsvpAnswer = holder.token.memberId
    ? await getMemberRsvpAnswer(organization.id, holder.event.id, holder.token.memberId)
    : await getGuestRsvpAnswer(organization.id, holder.event.id, holder.token.externalEmail!);
  const holderName = holder.token.memberId
    ? await db
        .select({ firstName: tenantMembers.firstName, lastName: tenantMembers.lastName })
        .from(tenantMembers)
        .where(eq(tenantMembers.id, holder.token.memberId))
        .limit(1)
        .then((rows) => (rows[0] ? getMemberDisplayName(rows[0]) : null))
    : holder.token.externalEmail;

  const data = await getFormForFiller(organization.id, form, holder.event, {
    kind: "token",
    memberId: holder.token.memberId,
    guestEmail: holder.token.externalEmail,
    guestName: holder.token.externalEmail,
    rsvpAnswer,
  });

  return (
    <PublicShell brand={organization.name}>
      <PublicFormCard
        form={form}
        event={holder.event}
        backHref={`/events/rsvp/${token}`}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        note={t.token.fillingAs(holderName ?? "")}
        t={t}
      >
        <PublicFormFiller
          data={{
            form: { id: form.id, title: form.title, description: form.description, eventId: form.eventId },
            questions: data.questions,
            open: data.open,
            canSubmit: data.canSubmit,
            submittedAt: data.submission?.submittedAt ?? null,
            answers: data.answers,
          }}
          source={{ kind: "token", token }}
        />
      </PublicFormCard>
    </PublicShell>
  );
}
