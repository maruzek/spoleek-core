import { AppPage } from "@/components/app/app-page";
import { EmailAdmin } from "@/components/app/email-admin";
import { requireAdminAccess } from "@/server/queries/access";
import {
  getOrganizationEmailActivityDetail,
  listOrganizationEmailActivities,
} from "@/server/queries/email-activity";

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });
  const params = searchParams ? await searchParams : {};
  const selectedEmailId =
    typeof params.email === "string" && params.email.length > 0 ? params.email : null;

  const [activities, selectedActivity] = await Promise.all([
    listOrganizationEmailActivities(organization.id),
    selectedEmailId
      ? getOrganizationEmailActivityDetail(organization.id, selectedEmailId)
      : Promise.resolve(null),
  ]);

  return (
    <AppPage
      eyebrow="Administration"
      title="Track organization email activity."
      description="Review outbound email history, delivery health, provider events, and invite-specific troubleshooting in one place."
      tooltip="This dashboard is the organization-level source of truth for outbound email activity captured by Spoleek. Invite emails are the first supported email type."
    >
      <EmailAdmin activities={activities} selectedActivity={selectedActivity} />
    </AppPage>
  );
}
