import { notFound } from "next/navigation";

import { PortalEventDetail } from "@/components/app/events/portal-event-detail";
import { PortalEventRsvp } from "@/components/app/events/portal-event-rsvp";
import { PortalEventForms, PortalInlineForm } from "@/components/app/forms/portal-event-forms";
import { isRsvpOpen } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getEventCounts, getEventDetail, getMemberResponse } from "@/server/queries/events";
import { getFormForFiller, listFormsForEvent } from "@/server/queries/forms";

export default async function PortalEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;

  const row = await getEventDetail(organization.id, { slug }, { memberId: member.id });
  if (!row) notFound();

  const [response, counts] = await Promise.all([
    getMemberResponse(organization.id, row.event.id, member.id),
    getEventCounts(organization.id, row.event.id),
  ]);

  // The member can see the event, so they are eligible for its forms.
  const identity = {
    kind: "member" as const,
    memberId: member.id,
    eligible: true,
    rsvpAnswer: response?.answer ?? null,
  };
  const forms = (await listFormsForEvent(organization.id, row.event, identity)).map((item) => ({
    ...item,
    event: row.event,
  }));
  // One `after_rsvp` form goes inline once the invitation is answered; the
  // rest are listed. Only the first, so the RSVP column stays a column.
  const inline =
    response != null
      ? forms.find((item) => item.placement === "inline_after_rsvp" && item.canSubmit && item.submittedAt == null) ?? null
      : null;
  const inlineData = inline
    ? await getFormForFiller(organization.id, inline.form, row.event, identity)
    : null;

  // Not wrapped in `AppPage`: the event header is the page title, same as
  // the admin record.
  return (
    <div className="flex flex-1 flex-col pb-8">
      <PortalEventDetail
        event={row.event}
        ownerName={row.ownerName ?? t.wholeOrganization}
        locale={orgFormatLocale(organization.locale)}
        timeZone={organization.timezone}
        counts={counts}
        response={response ? { answer: response.answer, standing: response.standing } : null}
        t={t}
        forms={<PortalEventForms items={forms.filter((item) => item.form.id !== inline?.form.id)} />}
        inlineForm={
          inlineData ? (
            <PortalInlineForm
              data={{
                form: {
                  id: inlineData.form.id,
                  title: inlineData.form.title,
                  description: inlineData.form.description,
                  eventId: inlineData.form.eventId,
                },
                questions: inlineData.questions,
                open: inlineData.open,
                canSubmit: inlineData.canSubmit,
                submittedAt: inlineData.submission?.submittedAt ?? null,
                answers: inlineData.answers,
                prefill: inlineData.prefill,
              }}
            />
          ) : null
        }
        rsvp={
          <PortalEventRsvp
            eventId={row.event.id}
            open={isRsvpOpen(row.event, new Date())}
            maxGuests={row.event.maxGuestsPerResponse}
            current={
              response ? { answer: response.answer, guestCount: response.guestCount, standing: response.standing } : null
            }
          />
        }
      />
    </div>
  );
}
