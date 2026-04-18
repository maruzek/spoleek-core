import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import { logMemberAuthEvent } from "@/server/lib/member-invites";

export async function linkUserToWorkspaceMember(user: {
  id: string;
  email: string;
}): Promise<void> {
  const normalizedEmail = user.email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const candidates = await db
    .select({ id: tenantMembers.id, orgId: tenantMembers.orgId })
    .from(tenantMembers)
    .where(
      and(
        isNull(tenantMembers.userId),
        isNotNull(tenantMembers.workspaceProvisionedAt),
        sql`lower(${tenantMembers.workspaceUserEmail}) = ${normalizedEmail}`,
      ),
    )
    .limit(2);

  if (candidates.length === 0) return;

  const [target, extra] = candidates;
  const now = new Date();

  await db
    .update(tenantMembers)
    .set({ userId: user.id, linkedAt: now, updatedAt: now })
    .where(and(eq(tenantMembers.id, target.id), isNull(tenantMembers.userId)));

  await logMemberAuthEvent({
    orgId: target.orgId,
    memberId: target.id,
    actorUserId: user.id,
    eventType: "workspace_user_linked",
    metadata: {
      workspaceUserEmail: normalizedEmail,
      ambiguous: Boolean(extra),
    },
  }).catch(() => undefined);
}
