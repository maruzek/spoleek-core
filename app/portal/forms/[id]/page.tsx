import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, HourglassIcon } from "lucide-react";

import { PortalFormFiller } from "@/components/app/forms/portal-form-filler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { buildMemberIdentity, getFormById, getFormEvent, getFormForFiller } from "@/server/queries/forms";

export default async function PortalFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().forms;
  const orgId = organization.id;

  const form = await getFormById(orgId, id);
  if (!form || form.isTemplate) notFound();
  const event = await getFormEvent(orgId, form);
  // A form on a draft event is unreachable because the event page is.
  if (form.eventId && (!event || event.status === "draft")) notFound();

  const identity = await buildMemberIdentity(orgId, form, event, member.id);
  const data = await getFormForFiller(orgId, form, event, identity);
  // Drafts and forms outside the member's audience do not exist for them,
  // unless they already answered (their copy stays readable).
  if (!data.submission && (form.status === "draft" || !identity.eligible)) notFound();

  const locale = orgFormatLocale(organization.locale);
  const closesAt = form.closesAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: organization.timezone }).format(form.closesAt)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 pb-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={event ? `/portal/events/${event.slug}` : "/portal/forms"}>
            <ArrowLeftIcon data-icon="inline-start" />
            {event ? t.detail.backToEvent : t.detail.back}
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {form.required ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
              {t.requiredBadge}
            </Badge>
          ) : (
            <Badge variant="outline">{t.optionalBadge}</Badge>
          )}
          <Badge variant="outline">{t.timing[form.timing]}</Badge>
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{form.title}</h1>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {event ? (
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" aria-hidden />
              <dd>
                <Link href={`/portal/events/${event.slug}`} className="hover:underline">
                  {t.forEvent(event.title)}
                </Link>
              </dd>
            </div>
          ) : null}
          {closesAt ? (
            <div className="flex items-center gap-1.5">
              <HourglassIcon className="size-3.5" aria-hidden />
              <dd>{t.closesAt(closesAt)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <PortalFormFiller
        data={{
          form: { id: form.id, title: form.title, description: form.description, eventId: form.eventId },
          questions: data.questions,
          open: data.open,
          canSubmit: data.canSubmit,
          submittedAt: data.submission?.submittedAt ?? null,
          answers: data.answers,
          prefill: data.prefill,
        }}
      />
    </div>
  );
}
