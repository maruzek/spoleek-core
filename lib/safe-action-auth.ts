import { betterAuth } from "@next-safe-action/adapter-better-auth";
import { eq } from "drizzle-orm";
import { createMiddleware } from "next-safe-action";

import { auth } from "@/lib/auth/auth";
import { actionClient } from "@/lib/safe-action";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const authActionClient = actionClient.use(betterAuth(auth));

const orgAdminMiddleware = createMiddleware<{
  ctx: {
    auth: typeof auth.$Infer.Session;
  };
}>().define(async ({ ctx, next }) => {
  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, ctx.auth.user.id))
    .limit(1);

  if (!user || user.systemRole !== "system_admin") {
    const { requireOrgAdminAccess } = await import("@/server/queries/access");
    await requireOrgAdminAccess(ctx.auth.user.id);
  }

  return next();
});

export const orgAdminActionClient = authActionClient.use(orgAdminMiddleware);
