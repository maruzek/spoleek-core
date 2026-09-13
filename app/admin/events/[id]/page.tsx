import { AppPage } from "@/components/app/app-page";
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
import { listAssignableTenantMembers } from "@/server/queries/groups";
import type { EventRecipient } from "@/server/queries/events";

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, event } = await requireEventManagementAccess(id);
  const orgId = context.organization.id;

  const [row, owners, picker, audience, eligibleIds, responses, counts, sendLog, members] =
    await Promise.all([
      getEventById(orgId, event.id),
      listManageableOwners(context),
      listEventsForOwnerPicker(orgId),
      listEventAudience(orgId, event.id),
      listEligibleMemberIds(orgId, event.id),
      listEventResponses(orgId, event.id),
      getEventCounts(orgId, event.id),
      listEventEmailActivities(orgId, event.id),
      listAssignableTenantMembers(orgId),
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

  return (
    <AppPage eyebrow="Events" title={event.title} description="Audience, responses and invitations for this event.">
      <EventAdminDetail
        event={event}
        ownerName={row?.ownerName ?? null}
        timeZone={context.organization.timezone}
        owners={{
          organization: owners.organization,
          categories: picker.categories.filter((c) => owners.categoryIds.includes(c.id)),
          groups: picker.groups.filter((g) => owners.groupIds.includes(g.id)),
        }}
        audience={audienceRows}
        audienceOptions={{
          groups: picker.groups,
          categories: picker.categories,
          members: members
            .filter((m) => m.status === "active")
            .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email })),
        }}
        eligibleCount={eligibleIds.size}
        responses={responses}
        counts={counts}
        recipients={recipients}
        sendLog={sendLog}
        publicUrl={event.visibility === "public" ? buildAbsoluteAppUrl(`/events/${event.slug}`) : null}
      />
    </AppPage>
  );
}
