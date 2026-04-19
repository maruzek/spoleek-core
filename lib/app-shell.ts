import type { MembershipManagementMode, TenantRole } from "@/server/db/schema";

export type AppSectionKey = "portal" | "admin";
export type AdminAccessLevel = "none" | "scoped" | "full";
export type AppShellAdminGroupPin = {
  id: string;
  title: string;
  href: string;
  groups: {
    id: string;
    title: string;
    href: string;
  }[];
};

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
    membershipManagementMode: MembershipManagementMode;
    fees: {
      enabled: boolean;
      renewalMonth: number | null;
      renewalDay: number | null;
      feeAmount: number | null;
      feeCurrency: string;
      feeBankAccount: string | null;
    };
  };
  member: {
    role: TenantRole;
    status: string;
  } | null;
  adminAccessLevel: AdminAccessLevel;
  capabilities: AppCapabilities;
  visibleSections: AppSectionKey[];
  navigation: {
    adminGroupPins: AppShellAdminGroupPin[];
  };
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
