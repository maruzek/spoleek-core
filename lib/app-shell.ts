import type { TenantRole } from "@/server/db/schema";

export type AppSectionKey = "portal" | "admin";
export type AdminAccessLevel = "none" | "scoped" | "full";

export type AppCapabilities = {
  canAccessPortal: boolean;
  canAccessAdmin: boolean;
  canManageGroups: boolean;
  canManageOrganization: boolean;
  canManageMembers: boolean;
  canManageScopedMembers: boolean;
  canManageEvents: boolean;
  canManagePayments: boolean;
};

export type AppShellContext = {
  viewer: {
    name: string;
    email: string;
    avatar: string | null;
  };
  organization: {
    name: string;
    slug: string;
  };
  member: {
    role: TenantRole;
    status: string;
  } | null;
  adminAccessLevel: AdminAccessLevel;
  capabilities: AppCapabilities;
  visibleSections: AppSectionKey[];
};

export function getDefaultSignedInRoute(context: Pick<AppShellContext, "capabilities">) {
  if (context.capabilities.canAccessPortal) {
    return "/portal";
  }

  if (context.capabilities.canAccessAdmin) {
    return "/admin";
  }

  return "/join";
}
