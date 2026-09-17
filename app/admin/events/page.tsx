import { AppPage } from "@/components/app/app-page";
import { EventsAdmin } from "@/components/app/events/events-admin";
import { listEventsForManager, listEventsForOwnerPicker } from "@/server/queries/events";

export default async function AdminEventsPage() {
  const now = new Date().getTime();
  const { context, owners, items } = await listEventsForManager();
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
      title="Events"
      description="Camps, meetings and open days with a built-in RSVP. Nothing is emailed unless you send it."
    >
      <EventsAdmin
        items={items}
        owners={ownerOptions}
        paymentDefaults={{
          currency: context.organization.membershipFeeCurrency,
          bankAccount: context.organization.membershipFeeBankAccount,
          locale: context.organization.locale,
        }}
        canCreate={canCreate}
        timeZone={context.organization.timezone}
        now={now}
      />
    </AppPage>
  );
}
