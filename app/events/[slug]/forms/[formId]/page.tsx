import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PublicFormCard } from "@/components/app/forms/public-form-card";
import { PublicFormFiller } from "@/components/app/forms/public-form-filler";
import { PublicShell } from "@/components/public/public-shell";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import { getEventDetail } from "@/server/queries/events";
import { getFormById, getFormForFiller } from "@/server/queries/forms";

export const dynamic = "force-dynamic";

/** Anonymous filler on a public event. The guest identifies themselves in the form. */
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string; formId: string }> }) {
  const { slug, formId } = await params;
  const dict = getDictionary();
  const t = dict.forms;
  const organization = await getAppOrganization();
  if (!organization) redirect("/setup");

  const row = await getEventDetail(organization.id, { slug }, null);
  if (!row || row.event.visibility !== "public") notFound();

  const form = await getFormById(organization.id, formId);
  if (!form || form.eventId !== row.event.id || form.status === "draft") notFound();

  // No email yet, so no existing submission to load; the action upserts by
  // the address the guest types in.
  const data = await getFormForFiller(organization.id, form, row.event, {
    kind: "guest",
    guestEmail: "",
    guestName: "",
    rsvpAnswer: null,
  });

  return (
    <PublicShell brand={organization.name}>
      <PublicFormCard
        form={form}
        event={row.event}
        backHref={`/events/${row.event.slug}`}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        note={
          <>
            {t.public.signInPrompt}{" "}
            <Link href={`/login?next=/portal/forms/${form.id}`} className="text-primary underline-offset-4 hover:underline">
              {t.public.signInLink}
            </Link>{" "}
            {t.public.signInSuffix}
          </>
        }
        t={t}
      >
        <PublicFormFiller
          data={{
            form: { id: form.id, title: form.title, description: form.description, eventId: form.eventId },
            questions: data.questions,
            open: data.open,
            // `onlyRsvpYes` is checked against the typed email on submit.
            canSubmit: data.canSubmit.ok || data.canSubmit.reason === "RSVP_REQUIRED" ? { ok: true } : data.canSubmit,
            submittedAt: null,
            answers: {},
          }}
          source={{ kind: "guest", eventSlug: row.event.slug }}
        />
      </PublicFormCard>
    </PublicShell>
  );
}
