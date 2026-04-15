import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import { tenantMembers, users } from "@/server/db/schema";

export async function getTenantMemberByUserId(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.userId, userId)),
    )
    .limit(1);

  return member ?? null;
}

export async function findShadowMemberForUser(orgId: string, email: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        isNull(tenantMembers.userId),
        ilike(tenantMembers.email, email),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function listTenantMembers(orgId: string) {
  return db
    .select({
      id: tenantMembers.id,
      fullName: tenantMembers.fullName,
      email: tenantMembers.email,
      role: tenantMembers.role,
      status: tenantMembers.status,
      phone: tenantMembers.phone,
      userId: tenantMembers.userId,
      createdAt: tenantMembers.createdAt,
      linkedUserName: users.name,
    })
    .from(tenantMembers)
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(eq(tenantMembers.orgId, orgId))
    .orderBy(asc(tenantMembers.createdAt));
}

export async function getMemberById(orgId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, memberId)),
    )
    .limit(1);

  return member ?? null;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), ilike(users.email, email)))
    .limit(1);

  return user ?? null;
}
