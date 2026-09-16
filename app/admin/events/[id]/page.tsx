import { EventAdminDetail } from "@/components/app/events/event-admin-detail";
import type { AudienceRow } from "@/components/app/events/event-audience-panel";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { eventRecipientFilterSchema, type EventRecipientFilter } from "@/lib/events/schemas";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { listManageableOwners, requireEventManagementAccess } from "@/server/queries/access";
import { listEventEmailActivities } from "@/server/queries/email-activity";
import {
  getEventById,
  getEventCounts,
  getEventRecipients,
  listEligibleMemberIds,
  listEventAudience,
  listEventResponses,
  listEventsForOwnerPicker,
} from "@/server/queries/events";
import type { EventRecipient } from "@/server/queries/events";
import { listEventFormsForManager, listFormsForManager } from "@/server/queries/forms";

export default async function AdminEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const { context, event } = await requireEventManagementAccess(id);
  const orgId = context.organization.id;

  const [row, owners, picker, audience, eligibleIds, responses, counts, sendLog] =
    await Promise.all([
      getEventById(orgId, event.id),
      listManageableOwners(context),
      listEventsForOwnerPicker(orgId),
      listEventAudience(orgId, event.id),
      listEligibleMemberIds(orgId, event.id),
      listEventResponses(orgId, event.id),
      getEventCounts(orgId, event.id),
      listEventEmailActivities(orgId, event.id),
    ]);

  const [formRows, managed, templates] = await Promise.all([
    listEventFormsForManager(orgId, event),
    listFormsForManager({ templates: false }),
    listFormsForManager({ templates: true }),
  ]);

  const recipientEntries = await Promise.all(
    eventRecipientFilterSchema.options.map(
      async (filter) => [filter, await getEventRecipients(orgId, event.id, filter)] as const,
    ),
  );
  const recipients = Object.fromEntries(recipientEntries) as Record<EventRecipientFilter, EventRecipient[]>;

  const audienceRows: AudienceRow[] = audience.map(({ rule, groupName, categoryName, memberFirstName, memberLastName }) => ({
    id: rule.id,
    kind: rule.kind,
    groupId: rule.groupId,
    categoryId: rule.categoryId,
    memberId: rule.memberId,
    externalEmail: rule.externalEmail,
    externalName: rule.externalName,
    label:
      rule.kind === "group"
        ? (groupName ?? "Group")
        : rule.kind === "category"
          ? (categoryName ?? "Category")
          : rule.kind === "member"
            ? getMemberDisplayName({ firstName: memberFirstName ?? "", lastName: memberLastName ?? "" })
            : (rule.externalEmail ?? ""),
  }));

  // Not wrapped in `AppPage`: the event header is the page title, same as
  // the member record.
  return (
    <div className="flex flex-1 flex-col pb-8">
      <EventAdminDetail
        event={event}
        ownerName={row?.ownerName ?? null}
        timeZone={context.organization.timezone}
        owners={{
          organization: owners.organization,
          categories: picker.categories.filter((c) => owners.categoryIds.includes(c.id)),
          groups: picker.groups.filter((g) => owners.groupIds.includes(g.id)),
        }}
        paymentDefaults={{
          currency: context.organization.membershipFeeCurrency,
          bankAccount: context.organization.membershipFeeBankAccount,
        }}
        audience={audienceRows}
        eligibleCount={eligibleIds.size}
        responses={responses}
        counts={counts}
        recipients={recipients}
        sendLog={sendLog}
        publicUrl={event.visibility === "public" ? buildAbsoluteAppUrl(`/events/${event.slug}`) : null}
        forms={formRows}
        unlinkedForms={managed.items.filter((item) => !item.form.eventId).map((item) => ({ id: item.form.id, title: item.form.title }))}
        formTemplates={templates.items.map((item) => ({ id: item.form.id, title: item.form.title }))}
        defaultTab={typeof query.tab === "string" ? query.tab : undefined}
      />
    </div>
  );
}
