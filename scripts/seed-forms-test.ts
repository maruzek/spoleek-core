/**
 * Fixture seeder for manual testing of forms.
 *
 * Usage:
 *   pnpm db:seed:forms           # add a template and a registration form (linked to the demo camp when present)
 *   pnpm db:seed:forms --reset   # remove them (title prefix "Demo · ")
 */
import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import { events } from "@/server/db/schema";
import { DEMO_EVENT_SLUG_PREFIX } from "@/server/lib/events/seed";
import { resetDemoForms, seedDemoForms } from "@/server/lib/forms/seed";
import { getAppOrganization } from "@/server/queries/app";

const reset = process.argv.slice(2).includes("--reset");

async function main() {
  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("No organization yet — run pnpm db:seed first.");
  }

  if (reset) {
    const removed = await resetDemoForms(organization.id);
    console.log(`Removed ${removed.length} demo form(s).`);
    return;
  }

  const [camp] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.orgId, organization.id), like(events.slug, `${DEMO_EVENT_SLUG_PREFIX}camp`)))
    .limit(1);

  const result = await seedDemoForms(organization.id, { eventId: camp?.id ?? null });
  console.log(
    `Seeded a template and a registration form (${result.submissions} submission(s)) for ${organization.name}${camp ? " on the demo camp" : ""}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
