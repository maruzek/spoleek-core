/**
 * Fixture seeder for manual testing of portal group self-service.
 *
 * Usage:
 *   pnpm db:seed:groups           # add the demo category, groups, leader and requests
 *   pnpm db:seed:groups --reset   # remove them (slug prefix "demo-", emails @groups.demo.test)
 */
import { resetDemoGroups, seedDemoGroups } from "@/server/lib/groups/seed";
import { getAppOrganization } from "@/server/queries/app";

const reset = process.argv.slice(2).includes("--reset");

async function main() {
  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("No organization yet — run pnpm db:seed first.");
  }

  if (reset) {
    const removed = await resetDemoGroups(organization.id);
    console.log(`Removed ${removed.categories} demo categor${removed.categories === 1 ? "y" : "ies"} and ${removed.members} demo member(s).`);
    return;
  }

  await seedDemoGroups(organization.id);
  console.log(`Seeded demo groups for ${organization.name}: Demo climbing (free), Demo hiking (request, 1 pending + 1 declined), Demo board (admin only).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
