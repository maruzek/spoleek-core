import { notFound } from "next/navigation";

import { PortalEventDetail } from "@/components/app/events/portal-event-detail";
import { PortalEventRsvp } from "@/components/app/events/portal-event-rsvp";
import { PortalEventForms } from "@/components/app/forms/portal-event-forms";
import { isRsvpOpen } from "@/lib/events/rsvp";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { canManageEvent, requireCurrentMemberAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import {
  getEventCounts,
  getEventDetail,
  getLivePaymentForResponse,
  getMemberResponse,
} from "@/server/queries/events";
import { getFormForFiller, listFormsForEvent } from "@/server/queries/forms";

export default async function PortalEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const t = getDictionary().events;

  const row = await getEventDetail(organization.id, { slug }, { memberId: member.id });
  if (!row) notFound();

  const [response, counts, canManage] = await Promise.all([
    getMemberResponse(organization.id, row.event.id, member.id),
    getEventCounts(organization.id, row.event.id),
    canManageEvent(viewer, row.event),
  ]);
  const payment = response ? await getLivePaymentForResponse(organization.id, response.id) : null;

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
  // One `after_rsvp` form is prompted for in a dialog as soon as the
  // invitation is answered (and on every load while a required one is
  // pending). The list above the description still shows it.
  const afterRsvp =
    forms.find((item) => item.placement === "inline_after_rsvp" && item.open.open && item.submittedAt == null) ?? null;
  const afterRsvpData = afterRsvp
    ? await getFormForFiller(organization.id, afterRsvp.form, row.event, identity)
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
        forms={<PortalEventForms items={forms} />}
        manageHref={canManage ? `/admin/events/${row.event.id}` : null}
        rsvp={
          <PortalEventRsvp
            eventId={row.event.id}
            open={isRsvpOpen(row.event, new Date())}
            maxGuests={row.event.maxGuestsPerResponse}
            current={
              response ? { answer: response.answer, guestCount: response.guestCount, standing: response.standing } : null
            }
            payment={payment}
            priced={row.event.priceAmount !== null}
            eventTitle={row.event.title}
            payerName={getMemberDisplayName(member)}
            paymentLabels={t.detail.payment}
            afterRsvpForm={
              afterRsvpData
                ? {
                    form: {
                      id: afterRsvpData.form.id,
                      title: afterRsvpData.form.title,
                      description: afterRsvpData.form.description,
                      eventId: afterRsvpData.form.eventId,
                    },
                    questions: afterRsvpData.questions,
                    open: afterRsvpData.open,
                    canSubmit: afterRsvpData.canSubmit,
                    submittedAt: afterRsvpData.submission?.submittedAt ?? null,
                    answers: afterRsvpData.answers,
                    prefill: afterRsvpData.prefill,
                    required: afterRsvpData.form.required,
                  }
                : null
            }
          />
        }
      />
    </div>
  );
}
