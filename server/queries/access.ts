import { and, eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";

import type { AppCapabilities, AppShellContext } from "@/lib/app-shell";
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

function getCapabilities({
  hasActiveMember,
  memberRole,
  systemRole,
}: {
  hasActiveMember: boolean;
  memberRole: "member" | "leader" | "org_admin" | null;
  systemRole: "member" | "system_admin";
}): { adminAccessLevel: AppShellContext["adminAccessLevel"]; capabilities: AppCapabilities } {
  if (systemRole === "system_admin") {
    return {
      adminAccessLevel: "full",
      capabilities: {
        canAccessPortal: hasActiveMember,
        canAccessAdmin: true,
        canManageOrganization: true,
        canManageMembers: true,
        canManageScopedMembers: true,
        canManageEvents: true,
        canManagePayments: true,
      },
    };
  }

  if (hasActiveMember && memberRole === "org_admin") {
    return {
      adminAccessLevel: "full",
      capabilities: {
        canAccessPortal: true,
        canAccessAdmin: true,
        canManageOrganization: true,
        canManageMembers: true,
        canManageScopedMembers: true,
        canManageEvents: true,
        canManagePayments: true,
      },
    };
  }

  if (hasActiveMember && memberRole === "leader") {
    return {
      adminAccessLevel: "scoped",
      capabilities: {
        canAccessPortal: true,
        canAccessAdmin: true,
        canManageOrganization: false,
        canManageMembers: false,
        canManageScopedMembers: true,
        canManageEvents: true,
        canManagePayments: false,
      },
    };
  }

  return {
    adminAccessLevel: "none",
    capabilities: {
      canAccessPortal: hasActiveMember,
      canAccessAdmin: false,
      canManageOrganization: false,
      canManageMembers: false,
      canManageScopedMembers: false,
      canManageEvents: false,
      canManagePayments: false,
    },
  };
}

export async function getViewerAppContext(): Promise<
  AppShellContext & {
    memberRecordId: string | null;
    organizationId: string;
    session: Awaited<ReturnType<typeof requireViewerSession>>;
  }
> {
  const session = await requireViewerSession();
  const organization = await requireOrganization();

  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.userId, session.user.id)),
    )
    .limit(1);

  const hasActiveMember = member?.status === "active";
  const { adminAccessLevel, capabilities } = getCapabilities({
    hasActiveMember,
    memberRole: member?.role ?? null,
    systemRole: user?.systemRole ?? "member",
  });

  return {
    session,
    organizationId: organization.id,
    memberRecordId: member?.id ?? null,
    organization: {
      name: organization.name,
      slug: organization.slug,
    },
    viewer: {
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image ?? null,
    },
    member: member
      ? {
          role: member.role,
          status: member.status,
        }
      : null,
    adminAccessLevel,
    capabilities,
    visibleSections: [
      ...(capabilities.canAccessPortal ? (["portal"] as const) : []),
      ...(capabilities.canAccessAdmin ? (["admin"] as const) : []),
    ],
  };
}

export async function requireCurrentMemberAccess() {
  const session = await requireViewerSession();
  const organization = await requireOrganization();
  const member = await getCurrentMember(session.user.id);

  if (!member) {
    redirect("/join");
  }

  return {
    session,
    organization,
    member,
  };
}

export async function requireCurrentMember() {
  const { member } = await requireCurrentMemberAccess();
  return member;
}

export async function requireAdminAccess(options?: {
  capability?: keyof AppCapabilities;
  requireFullAccess?: boolean;
}) {
  const appContext = await getViewerAppContext();
  const organization = await requireOrganization();
  const member = await getCurrentMember(appContext.session.user.id);

  if (!appContext.capabilities.canAccessAdmin) {
    forbidden();
  }

  if (options?.requireFullAccess && appContext.adminAccessLevel !== "full") {
    forbidden();
  }

  if (options?.capability && !appContext.capabilities[options.capability]) {
    forbidden();
  }

  return {
    ...appContext,
    organization,
    member,
  };
}

export async function requireOrgAdminAccess(userId?: string) {
  if (userId) {
    const organization = await requireOrganization();

    const [user] = await db
      .select({ systemRole: users.systemRole })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.systemRole === "system_admin") {
      return { organization, member: null };
    }

    const [member] = await db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.userId, userId)))
      .limit(1);

    if (!member || member.status !== "active" || member.role !== "org_admin") {
      forbidden();
    }

    return { organization, member };
  }

  const { organization, member } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  return { organization, member };
}
