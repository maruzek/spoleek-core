import { and, eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";

import { db } from "@/server/db";
import { tenantMembers, users } from "@/server/db/schema";
import { getAppOrganization } from "@/server/queries/app";
import { requireViewerSession } from "@/server/queries/auth";

export async function requireOrganization() {
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  return organization;
}

export async function getCurrentMember(userId: string) {
  const organization = await requireOrganization();
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.userId, userId)),
    )
    .limit(1);

  return member ?? null;
}

export async function requireCurrentMember() {
  const session = await requireViewerSession();
  const member = await getCurrentMember(session.user.id);

  if (!member) {
    redirect("/join");
  }

  return member;
}

export async function requireOrgAdminAccess(userId?: string) {
  const resolvedUserId = userId ?? (await requireViewerSession()).user.id;
  const organization = await requireOrganization();

  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, resolvedUserId))
    .limit(1);

  if (user?.systemRole === "system_admin") {
    return { organization, member: null };
  }

  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, organization.id),
        eq(tenantMembers.userId, resolvedUserId),
      ),
    )
    .limit(1);

  if (!member || member.status !== "active" || member.role !== "org_admin") {
    forbidden();
  }

  return { organization, member };
}
