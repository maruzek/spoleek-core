import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  accounts,
  organizations,
  sessions,
  tenantMembers,
  users,
} from "@/server/db/schema";
import {
  MEMBER_SOFT_DELETE_RETENTION_DAYS,
  hardDeleteMembers,
  purgeDeletedMembers,
  softDeleteMembers,
} from "@/server/lib/member-lifecycle";

/**
 * Erasure has to reach the login, not just the membership.
 *
 * Purging `tenant_members` alone used to leave the `users` row, the password
 * hash in `accounts` and any Google refresh token in place forever — reachable
 * by nobody, because the member row that pointed at them was gone. These tests
 * assert the whole identity goes, and that the two cases where it must *not* go
 * still hold.
 *
 * Needs a database. Creates its own organization and users, and removes both
 * afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("member erasure", () => {
  let orgId: string;
  const createdUserIds: string[] = [];

  async function makeUser(
    name: string,
    systemRole: "member" | "system_admin" = "member",
  ) {
    const id = `erasure-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.insert(users).values({
      id,
      name,
      email: `${id}@example.test`,
      systemRole,
    });

    // The two things that must not outlive the member.
    await db.insert(accounts).values({
      id: `${id}-account`,
      userId: id,
      accountId: id,
      providerId: "credential",
      password: "not-a-real-hash",
    });
    await db.insert(sessions).values({
      id: `${id}-session`,
      userId: id,
      token: `${id}-token`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    createdUserIds.push(id);
    return id;
  }

  async function makeMember({
    userId,
    role = "member",
  }: {
    userId: string | null;
    role?: "member" | "org_admin";
  }) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        userId,
        firstName: "Erasure",
        lastName: "Testcase",
        email: `${userId ?? "shadow"}@example.test`,
        role,
        status: "active",
      })
      .returning({ id: tenantMembers.id });

    return member.id;
  }

  /** Backdates the soft deletion so the purge's cutoff sees it as expired. */
  async function expireDeletion(memberId: string) {
    const past = new Date();
    past.setDate(past.getDate() - MEMBER_SOFT_DELETE_RETENTION_DAYS - 1);

    await db
      .update(tenantMembers)
      .set({ deletedAt: past })
      .where(eq(tenantMembers.id, memberId));
  }

  async function userExists(userId: string) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    return rows.length > 0;
  }

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `erasure-test-${Date.now()}`,
        name: "Erasure test org",
      })
      .returning({ id: organizations.id });

    orgId = organization.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await pool.end();
  });

  it("revokes sessions on soft delete but keeps the identity recoverable", async () => {
    const userId = await makeUser("softdelete");
    const memberId = await makeMember({ userId });

    await softDeleteMembers({ actorUserId: userId, memberIds: [memberId], orgId });

    const liveSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId));

    expect(liveSessions).toHaveLength(0);
    expect(await userExists(userId)).toBe(true);

    // The link the purge needs is what makes the identity findable later.
    const [member] = await db
      .select({ userId: tenantMembers.userId, status: tenantMembers.status })
      .from(tenantMembers)
      .where(eq(tenantMembers.id, memberId));

    expect(member.userId).toBe(userId);
    expect(member.status).toBe("deleted");
  });

  it("leaves no orphaned users row behind after a purge", async () => {
    const userId = await makeUser("purge");
    const memberId = await makeMember({ userId });

    await softDeleteMembers({ actorUserId: userId, memberIds: [memberId], orgId });
    await expireDeletion(memberId);

    const result = await purgeDeletedMembers();

    expect(result.deletedIdentityCount).toBeGreaterThanOrEqual(1);
    expect(await userExists(userId)).toBe(false);

    // Cascades, so a surviving row here means the password hash outlived the member.
    const leftoverAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    expect(leftoverAccounts).toHaveLength(0);
  });

  it("keeps an identity that still has another membership", async () => {
    const userId = await makeUser("multiorg");
    const [otherOrg] = await db
      .insert(organizations)
      .values({
        slug: `erasure-test-other-${Date.now()}`,
        name: "Other org",
      })
      .returning({ id: organizations.id });

    const memberId = await makeMember({ userId });
    await db.insert(tenantMembers).values({
      orgId: otherOrg.id,
      userId,
      firstName: "Erasure",
      lastName: "Elsewhere",
      status: "active",
    });

    await softDeleteMembers({ actorUserId: userId, memberIds: [memberId], orgId });
    await expireDeletion(memberId);
    await purgeDeletedMembers();

    expect(await userExists(userId)).toBe(true);

    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  });

  it("keeps the system admin's account", async () => {
    const userId = await makeUser("sysadmin", "system_admin");
    const memberId = await makeMember({ userId });

    await softDeleteMembers({ actorUserId: userId, memberIds: [memberId], orgId });
    await expireDeletion(memberId);
    await purgeDeletedMembers();

    expect(await userExists(userId)).toBe(true);
  });

  it("deletes an org admin as long as another one remains", async () => {
    const keptId = await makeUser("admin-kept");
    const goneId = await makeUser("admin-gone");
    const keptMember = await makeMember({ userId: keptId, role: "org_admin" });
    const goneMember = await makeMember({ userId: goneId, role: "org_admin" });

    const result = await softDeleteMembers({
      actorUserId: keptId,
      memberIds: [goneMember],
      orgId,
    });

    expect(result.deletedCount).toBe(1);
    expect(result.skippedProtectedCount).toBe(0);

    // ...and refuses once that one is the last.
    const lastAdmin = await softDeleteMembers({
      actorUserId: keptId,
      memberIds: [keptMember],
      orgId,
    });

    expect(lastAdmin.deletedCount).toBe(0);
    expect(lastAdmin.skippedProtectedCount).toBe(1);

    const [stillThere] = await db
      .select({ status: tenantMembers.status })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.id, keptMember), eq(tenantMembers.orgId, orgId)));

    expect(stillThere.status).toBe("active");
  });

  it("erases the identity immediately on a hard delete", async () => {
    const userId = await makeUser("harddelete");
    const memberId = await makeMember({ userId });

    const result = await hardDeleteMembers({ memberIds: [memberId], orgId });

    expect(result.deletedCount).toBe(1);
    expect(await userExists(userId)).toBe(false);
  });
});
