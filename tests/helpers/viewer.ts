import type { Viewer, ViewerScope } from "@/lib/access/viewer";
import type { Organization, TenantMember } from "@/server/db/schema";

/**
 * A Viewer (CONTEXT.md) built by hand: only the fields the access predicates
 * read are real, the rest of the organization and member rows are stubs.
 * Pure tests pass a `scope`; DB tests load one with `loadViewerScope`.
 */
export function makeViewer(overrides: {
  orgId?: string;
  organization?: Partial<Organization>;
  member?: Partial<TenantMember> | null;
  systemRole?: Viewer["systemRole"];
  scope?: Partial<ViewerScope>;
}): Viewer {
  const orgId = overrides.orgId ?? "org-1";
  const member =
    overrides.member === null
      ? null
      : ({
          id: "member-1",
          orgId,
          userId: "user-1",
          role: "member",
          status: "active",
          ...overrides.member,
        } as TenantMember);

  return {
    user: { id: member?.userId ?? "user-1", name: "Test", email: "test@example.test", image: null },
    systemRole: overrides.systemRole ?? "member",
    organization: {
      id: orgId,
      orgEventCreators: "org_admins",
      ...overrides.organization,
    } as Organization,
    member,
    scope: { categoryIds: [], groups: [], ...overrides.scope },
  };
}
