import { sql } from "drizzle-orm";

import { db } from "@/server/db";

let cachedAvailability: boolean | null = null;

export async function hasGroupCategoryMembersTableColumn() {
  if (cachedAvailability !== null) {
    return cachedAvailability;
  }

  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'group_categories'
        and column_name = 'show_in_members_table'
    ) as "exists"
  `);

  const row = result.rows[0] as { exists?: boolean } | undefined;
  cachedAvailability = row?.exists === true;

  return cachedAvailability;
}
