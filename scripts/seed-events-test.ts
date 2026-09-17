/**
 * Fixture seeder for manual testing of events.
 *
 * Usage:
 *   pnpm db:seed:events           # add the three demo events to the app org
 *   pnpm db:seed:events --reset   # remove them (slug prefix "demo-")
 */
import { resetDemoEvents, seedDemoEvents } from "@/server/lib/events/seed";
import { getAppOrganization } from "@/server/queries/app";

const reset = process.argv.slice(2).includes("--reset");

async function main() {
  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("No organization yet — run pnpm db:seed first.");
  }

  if (reset) {
    const removed = await resetDemoEvents(organization.id);
    console.log(`Removed ${removed.length} demo event(s).`);
    return;
  }

  const result = await seedDemoEvents(organization.id);
  console.log(`Seeded ${result.created} demo event(s) for ${organization.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
