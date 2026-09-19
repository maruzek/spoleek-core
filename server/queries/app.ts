import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { organizationPolicies, organizations, tenantMembers } from "@/server/db/schema";

export async function getAppOrganization() {
  const [organization] = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  return organization ?? null;
}

/**
 * Where an account's mail is logged when there is no request to resolve a
 * Viewer from (Better Auth callbacks): the org of their live member row, or
 * the app's organization for an account with no member row (a system admin).
 */
export async function resolveMembershipForUser(
  userId: string,
): Promise<{ orgId: string; memberId: string | null } | null> {
  const [member] = await db
    .select({ orgId: tenantMembers.orgId, memberId: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.userId, userId), ne(tenantMembers.status, "deleted")))
    .orderBy(asc(tenantMembers.createdAt))
    .limit(1);

  if (member) {
    return member;
  }

  const organization = await getAppOrganization();
  return organization ? { orgId: organization.id, memberId: null } : null;
}

export async function getOrganizationPolicy(orgId: string) {
  const [policy] = await db
    .select()
    .from(organizationPolicies)
    .where(eq(organizationPolicies.orgId, orgId))
    .limit(1);

  return policy ?? null;
}

export async function getOrganizationJoinPage(orgId: string) {
  const [organizationRows, policy] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        joinPageHeadline: organizations.joinPageHeadline,
        joinPageBody: organizations.joinPageBody,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    getOrganizationPolicy(orgId),
  ]);
  const organization = organizationRows[0];

  if (!organization || !policy) {
    return null;
  }

  return {
    ...organization,
    ...policy,
  };
}

export async function getAppSetupState() {
  const organization = await getAppOrganization();

  return {
    hasOrganization: Boolean(organization),
    organization,
  };
}
