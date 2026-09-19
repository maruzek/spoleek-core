import { AppPage } from "@/components/app/app-page";
import { FormsAdmin } from "@/components/app/forms/forms-admin";
import { listEventsForManager, listEventsForOwnerPicker } from "@/server/queries/events";
import { listFormsForManager } from "@/server/queries/forms";
import { requireViewer } from "@/server/queries/viewer";

export default async function AdminFormsPage() {
  const viewer = await requireViewer();
  const [{ context, owners, items }, templates, events] = await Promise.all([
    listFormsForManager(viewer, { templates: false }),
    listFormsForManager(viewer, { templates: true }),
    listEventsForManager(viewer),
  ]);
  const picker = await listEventsForOwnerPicker(context.organization.id);

  const ownerOptions = {
    organization: owners.organization,
    categories: picker.categories.filter((c) => owners.categoryIds.includes(c.id)),
    groups: picker.groups.filter((g) => owners.groupIds.includes(g.id)),
  };
  const canCreate =
    ownerOptions.organization || ownerOptions.categories.length > 0 || ownerOptions.groups.length > 0;

  return (
    <AppPage
      eyebrow="Administration"
      title="Forms"
      description="Registrations, dietary sheets, evaluations — linked to an event or standing alone. Answers stay in the register and expire when you say so."
    >
      <FormsAdmin
        items={items}
        templates={templates.items}
        owners={ownerOptions}
        canManageTemplates={context.capabilities.canManageOrganization}
        canCreate={canCreate}
        events={events.items
          .filter((item) => item.event.status !== "cancelled")
          .map((item) => ({ id: item.event.id, title: item.event.title, startsAt: item.event.startsAt }))}
        timeZone={context.organization.timezone}
      />
    </AppPage>
  );
}
