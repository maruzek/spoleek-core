import { notFound, redirect } from "next/navigation";

import { PublicFormCard } from "@/components/app/forms/public-form-card";
import { PublicFormFiller } from "@/components/app/forms/public-form-filler";
import { PublicShell } from "@/components/public/public-shell";
import { submissionIdentityOf } from "@/lib/events/responder";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getViewerSession } from "@/server/queries/auth";
import { getFormById, getFormForFiller } from "@/server/queries/forms";
import { getResponderResponse, resolveTokenResponder } from "@/server/queries/responder";

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

  const resolved = await resolveTokenResponder(organization.id, token, new Date());
  if (!resolved) {
    return (
      <PublicShell brand={organization.name} width="narrow">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <h1 className="font-heading text-xl font-semibold">{t.token.invalidTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.token.invalidBody}</p>
        </div>
      </PublicShell>
    );
  }
  const { event, responder } = resolved;

  if (responder.memberUserId) {
    const session = await getViewerSession();
    if (session?.user.id === responder.memberUserId) redirect(`/portal/forms/${formId}`);
  }

  const form = await getFormById(organization.id, formId);
  if (!form || form.eventId !== event.id || form.status === "draft") notFound();

  const response = await getResponderResponse(organization.id, event.id, responder);
  const data = await getFormForFiller(
    organization.id,
    form,
    event,
    submissionIdentityOf(responder, response?.answer ?? null),
  );

  return (
    <PublicShell brand={organization.name}>
      <PublicFormCard
        form={form}
        event={event}
        backHref={`/events/rsvp/${token}`}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        note={t.token.fillingAs(responder.displayName)}
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
