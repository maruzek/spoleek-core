import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { organizationPolicies, organizations } from "@/server/db/schema";

export async function getAppOrganization() {
  const [organization] = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  return organization ?? null;
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
