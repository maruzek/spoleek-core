import { AppPage } from "@/components/app/app-page";
import { AdminDashboard } from "@/components/app/dashboard/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { orgFormatLocale } from "@/lib/i18n";
import { requireAdminAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { getAdminDashboardData } from "@/server/queries/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const viewer = await requireViewer();
  const context = await requireAdminAccess(viewer);
  const data = await getAdminDashboardData(context);

  const locale = orgFormatLocale(context.organization.locale);
  const dateline = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data.now);

  const firstName =
    context.member?.firstName?.trim() || context.viewer.user.name.split(" ")[0] || "";

  const summary = [
    data.attention.length === 0
      ? "nothing needs you"
      : `${data.attention.length} ${data.attention.length === 1 ? "thing needs" : "things need"} you`,
    `${data.upcoming.length} coming up`,
    `${data.activity.length} ${data.activity.length === 1 ? "update" : "updates"} this week`,
  ].join(" · ");

  return (
    <AppPage
      eyebrow={dateline}
      title={firstName ? `${firstName}, here is where things stand.` : "Here is where things stand."}
      description={summary}
      actions={
        <Badge variant={context.adminAccessLevel === "full" ? "default" : "secondary"}>
          {context.adminAccessLevel === "full" ? "Full admin access" : "Scoped admin access"}
        </Badge>
      }
    >
      <AdminDashboard data={data} />
    </AppPage>
  );
}
