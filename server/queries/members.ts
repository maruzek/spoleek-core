import { and, asc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "@/server/db";
import { tenantMembers, users } from "@/server/db/schema";
import { getMemberCustomFieldAnswerMap } from "@/server/queries/member-custom-fields";

export async function getTenantMemberByUserId(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.userId, userId),
        ne(tenantMembers.status, "deleted"),
      ),
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
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function findTenantMemberByEmail(orgId: string, email: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        ilike(tenantMembers.email, email),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function listTenantMembers(orgId: string) {
  return db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      role: tenantMembers.role,
      status: tenantMembers.status,
      userId: tenantMembers.userId,
      createdAt: tenantMembers.createdAt,
      linkedUserName: users.name,
    })
    .from(tenantMembers)
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .orderBy(asc(tenantMembers.createdAt));
}

export async function getMemberById(orgId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.id, memberId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function getMemberByUserId(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.userId, userId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function getMemberEditorData(orgId: string, memberId: string) {
  const member = await getMemberById(orgId, memberId);

  if (!member) {
    return null;
  }

  const customFieldAnswers = await getMemberCustomFieldAnswerMap(orgId, member.id);

  return {
    member,
    customFieldAnswers,
  };
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), ilike(users.email, email)))
    .limit(1);

  return user ?? null;
}

export async function getMembersByIds(orgId: string, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        inArray(tenantMembers.id, memberIds),
        ne(tenantMembers.status, "deleted"),
      ),
    );
}
