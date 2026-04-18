import { AppPage } from "@/components/app/app-page";
import {
  WorkspaceSettingsCard,
  type WorkspaceSettingsState,
} from "@/components/app/workspace-settings-card";
import { requireAdminAccess } from "@/server/queries/access";
import { getAppOrganization } from "@/server/queries/app";
import { db } from "@/server/db";
import { workspaceConnections } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export default async function AdminWorkspaceSettingsPage() {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("Organization is not available.");
  }

  const [connection] = await db
    .select({
      grantedByEmail: workspaceConnections.grantedByEmail,
      grantedAt: workspaceConnections.grantedAt,
    })
    .from(workspaceConnections)
    .where(
      and(
        eq(workspaceConnections.orgId, organization.id),
        isNull(workspaceConnections.revokedAt),
      ),
    )
    .limit(1);

  const state: WorkspaceSettingsState = {
    moduleEnabled: Boolean(organization.workspaceModuleEnabled),
    connected: Boolean(organization.workspaceConnectedAt),
    domain: organization.workspaceDomain ?? null,
    emailTemplate: organization.workspaceEmailTemplate ?? "{first}.{last}",
    adminEmail:
      organization.workspaceAdminEmail ?? connection?.grantedByEmail ?? null,
    connectedAt:
      organization.workspaceConnectedAt?.toISOString() ??
      connection?.grantedAt?.toISOString() ??
      null,
  };

  return (
    <AppPage
      eyebrow="Administration"
      title="Google Workspace integration."
      description="Provision Google Workspace accounts for new members automatically when you approve their applications."
    >
      <WorkspaceSettingsCard state={state} />
    </AppPage>
  );
}
