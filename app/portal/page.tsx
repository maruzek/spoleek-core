import { AppPage } from "@/components/app/app-page";
import { PortalDashboard } from "@/components/app/portal/portal-dashboard";
import { orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getPortalDashboardData } from "@/server/queries/portal-dashboard";

export const dynamic = "force-dynamic";

export default async function PortalOverviewPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });

  const data = await getPortalDashboardData({ organization, member });

  const dateline = new Intl.DateTimeFormat(orgFormatLocale(organization.locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data.now);

  const firstName = member.firstName.trim();
  const todoCount = data.todos.length;
  const summary = [
    todoCount === 0 ? "nothing to do" : `${todoCount} ${todoCount === 1 ? "thing" : "things"} to do`,
    `${data.upcoming.length} coming up`,
    data.membership.groups.length === 0
      ? "no groups yet"
      : `${data.membership.groups.length} ${data.membership.groups.length === 1 ? "group" : "groups"}`,
  ].join(" · ");

  return (
    <AppPage
      eyebrow={dateline}
      title={firstName ? `Hi ${firstName}, welcome back.` : "Welcome back."}
      description={summary}
    >
      <PortalDashboard data={data} orgName={organization.name} />
    </AppPage>
  );
}
