import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarIcon, HourglassIcon } from "lucide-react";

import { PAGE_WIDTH } from "@/components/app/app-page";
import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { PortalFormFiller } from "@/components/app/forms/portal-form-filler";
import { Badge } from "@/components/ui/badge";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { buildMemberIdentity, getFormById, getFormEvent, getFormForFiller } from "@/server/queries/forms";

export default async function PortalFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
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
    <div className={cn("flex flex-1 flex-col gap-6 pb-8", PAGE_WIDTH.content)}>
      <DetailHeader
        backHref={event ? `/portal/events/${event.slug}` : "/portal/forms"}
        backLabel={event ? t.detail.backToEvent : t.detail.back}
        badges={
          <>
            {form.required ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
                {t.requiredBadge}
              </Badge>
            ) : (
              <Badge variant="outline">{t.optionalBadge}</Badge>
            )}
            <Badge variant="outline">{t.timing[form.timing]}</Badge>
          </>
        }
        title={form.title}
        meta={
          <DetailMeta>
            {event ? (
              <DetailMetaItem icon={<CalendarIcon aria-hidden />}>
                <Link href={`/portal/events/${event.slug}`} className="hover:underline">
                  {t.forEvent(event.title)}
                </Link>
              </DetailMetaItem>
            ) : null}
            {closesAt ? (
              <DetailMetaItem icon={<HourglassIcon aria-hidden />}>{t.closesAt(closesAt)}</DetailMetaItem>
            ) : null}
          </DetailMeta>
        }
      />

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
