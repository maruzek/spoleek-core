import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import { organizationPolicies, organizations } from "@/server/db/schema";
import { seedOrganizationPolicies } from "@/server/lib/policy-seed";

async function main() {
  const existing = await db.select().from(organizations).limit(1);

  if (existing.length > 0) {
    console.log("Seed skipped: organization already exists.");
    return;
  }

  const orgId = randomUUID();

  await db.insert(organizations).values({
    id: orgId,
    slug: "demo-org",
    name: "Demo Organization",
    legalName: "Demo Organization z.s.",
    primaryEmail: "hello@example.test",
    locale: "en",
  });

  await db.insert(organizationPolicies).values({ id: randomUUID(), orgId });

  await seedOrganizationPolicies(db, {
    orgId,
    organizationName: "Demo Organization",
    locale: "en",
  });

  console.log("Seeded demo organization.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
