import type { AdminAccessLevel, AppCapabilities } from "@/lib/app-shell";
import type { Organization, SystemRole, TenantMember } from "@/server/db/schema";

/**
 * Viewer (see CONTEXT.md): everything the access rules need to know about the
 * signed-in user, resolved once per request. Pure predicates over this value
 * are the only place an access rule is spelled; the throwing guards in
 * `server/queries/access.ts` and the safe-action middleware are one-liners over
 * them, and tests build a Viewer by hand.
 */
export type ViewerScope = {
  /** Categories the member holds a category-admin assignment for. */
  categoryIds: string[];
  /**
   * Groups the member is an active `group_admin` of, with the category each
   * sits in. `managesMembers` is the category's `groupAdminsManageMembers`
   * flag, false when the group or category is inactive.
   */
  groups: { id: string; categoryId: string; managesMembers: boolean }[];
};

export const EMPTY_VIEWER_SCOPE: ViewerScope = { categoryIds: [], groups: [] };

export type Viewer = {
  user: { id: string; name: string; email: string; image: string | null };
  systemRole: SystemRole;
  organization: Organization;
  /** The viewer's member record in the organization, never a deleted one. */
  member: TenantMember | null;
  /** Empty unless the member is active. */
  scope: ViewerScope;
};

/** What an event or form is owned by, resolved to the ids the rules need. */
export type EventOwner =
  | { type: "organization" }
  | { type: "category"; categoryId: string }
  | { type: "group"; group: { id: string; categoryId: string } };

export function isSystemAdmin(viewer: Viewer) {
  return viewer.systemRole === "system_admin";
}

export function isActiveMember(viewer: Viewer) {
  return viewer.member?.status === "active";
}

/** System admins and active org admins: every gate is open. */
export function isFullAdmin(viewer: Viewer) {
  return isSystemAdmin(viewer) || (isActiveMember(viewer) && viewer.member?.role === "org_admin");
}

export function isLeader(viewer: Viewer) {
  return isActiveMember(viewer) && viewer.member?.role === "leader";
}

/** Full admins and leaders manage every group and category in the organization. */
export function managesEveryGroup(viewer: Viewer) {
  return isFullAdmin(viewer) || isLeader(viewer);
}

export function hasScopedGroupManagement(viewer: Viewer) {
  return (
    isActiveMember(viewer) &&
    (viewer.scope.categoryIds.length > 0 || viewer.scope.groups.length > 0)
  );
}

export function hasScopedMemberManagement(viewer: Viewer) {
  return isActiveMember(viewer) && viewer.scope.groups.some((group) => group.managesMembers);
}

export function getAdminAccessLevel(viewer: Viewer): AdminAccessLevel {
  if (isFullAdmin(viewer)) return "full";
  if (isLeader(viewer) || hasScopedGroupManagement(viewer)) return "scoped";
  return "none";
}

export function getCapabilities(viewer: Viewer): AppCapabilities {
  const hasActiveMember = isActiveMember(viewer);

  if (isSystemAdmin(viewer)) {
    return {
      canAccessPortal: hasActiveMember,
      canAccessAdmin: true,
      canManageGroups: true,
      canManageOrganization: true,
      canManageMembers: true,
      canManageScopedMembers: true,
      canManageEvents: true,
      canManagePayments: true,
    };
  }

  if (isFullAdmin(viewer)) {
    return {
      canAccessPortal: true,
      canAccessAdmin: true,
      canManageGroups: true,
      canManageOrganization: true,
      canManageMembers: true,
      canManageScopedMembers: true,
      canManageEvents: true,
      canManagePayments: true,
    };
  }

  if (isLeader(viewer)) {
    return {
      canAccessPortal: true,
      canAccessAdmin: true,
      canManageGroups: true,
      canManageOrganization: false,
      canManageMembers: false,
      canManageScopedMembers: hasScopedMemberManagement(viewer),
      canManageEvents: true,
      canManagePayments: false,
    };
  }

  if (hasScopedGroupManagement(viewer)) {
    return {
      canAccessPortal: true,
      canAccessAdmin: true,
      canManageGroups: true,
      canManageOrganization: false,
      canManageMembers: false,
      canManageScopedMembers: hasScopedMemberManagement(viewer),
      canManageEvents: false,
      canManagePayments: true,
    };
  }

  return {
    canAccessPortal: hasActiveMember,
    canAccessAdmin: false,
    canManageGroups: false,
    canManageOrganization: false,
    canManageMembers: false,
    canManageScopedMembers: false,
    canManageEvents: false,
    canManagePayments: false,
  };
}

/** Category admin of the category itself (a group admin inside it is not). */
export function canManageCategory(viewer: Viewer, categoryId: string) {
  if (managesEveryGroup(viewer)) return true;
  return isActiveMember(viewer) && viewer.scope.categoryIds.includes(categoryId);
}

/**
 * May open the category overview: category admins, and group admins of any
 * group in it (they see the category page to reach their group).
 */
export function canOverseeCategory(viewer: Viewer, categoryId: string) {
  if (canManageCategory(viewer, categoryId)) return true;
  return isActiveMember(viewer) && viewer.scope.groups.some((group) => group.categoryId === categoryId);
}

/** Every category the viewer may open the overview of. Null when that is all of them. */
export function overseenCategoryIds(viewer: Viewer): string[] | null {
  if (managesEveryGroup(viewer)) return null;
  if (!isActiveMember(viewer)) return [];
  return [...new Set([...viewer.scope.categoryIds, ...viewer.scope.groups.map((g) => g.categoryId)])];
}

/**
 * Org admins, leaders and system admins manage every group; otherwise the
 * member must be a category admin over its category or a group admin of it.
 */
export function canManageGroup(viewer: Viewer, group: { id: string; categoryId: string }) {
  if (canManageCategory(viewer, group.categoryId)) return true;
  return isActiveMember(viewer) && viewer.scope.groups.some((scoped) => scoped.id === group.id);
}

/**
 * Who may manage an event or form, decided by its owner. Group and category
 * owners follow their owner's management access; an organization-wide owner
 * is gated by `organizations.orgEventCreators`, so a federation can let every
 * troop leader post org-wide without making them org admins.
 */
export function canManageOwner(viewer: Viewer, owner: EventOwner) {
  if (owner.type === "group") return canManageGroup(viewer, owner.group);
  if (owner.type === "category") return canManageCategory(viewer, owner.categoryId);
  return canManageOrganizationOwner(viewer);
}

/**
 * The organization-wide owner. Full admins and leaders always; the
 * `orgEventCreators` setting then decides which scoped admins may too:
 * `org_admins` → nobody else, `category_admins` → category admins,
 * `any_admin` → category admins and group admins.
 */
function canManageOrganizationOwner(viewer: Viewer) {
  if (managesEveryGroup(viewer)) return true;
  if (!isActiveMember(viewer)) return false;

  const setting = viewer.organization.orgEventCreators;
  if (setting === "org_admins") return false;
  if (viewer.scope.categoryIds.length > 0) return true;
  return setting === "any_admin" && viewer.scope.groups.length > 0;
}
