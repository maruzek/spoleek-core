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

export async function getAppSetupState() {
  const organization = await getAppOrganization();

  return {
    hasOrganization: Boolean(organization),
    organization,
  };
}
