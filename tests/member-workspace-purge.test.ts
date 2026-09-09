import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

/**
 * The purge has to delete a member's Google Workspace account before it deletes
 * the member row, because the row is the only record that an account still
 * needs deleting. Get the order wrong and one failed API call strands a live
 * mailbox with a working refresh token that nothing can ever find again.
 *
 * These tests drive that ordering through a mocked directory client. The
 * mock is declared before importing anything that reaches it, so
 * `member-lifecycle` binds to the fake rather than the real Google call.
 *
 * Needs a database. Creates its own organization and removes it afterwards.
 */
const deleteWorkspaceUser = vi.fn();

class FakeNotConnectedError extends Error {
  constructor() {
    super("Workspace is not connected.");
    this.name = "WorkspaceNotConnectedError";
  }
}

vi.mock("@/server/lib/workspace/client", () => ({
  deleteWorkspaceUser: (...args: unknown[]) => deleteWorkspaceUser(...args),
  WorkspaceNotConnectedError: FakeNotConnectedError,
}));

const { db, pool } = await import("@/server/db");
const { organizations, tenantMembers } = await import("@/server/db/schema");
const { MAX_WORKSPACE_PURGE_ATTEMPTS, purgeDeletedMembers } = await import(
  "@/server/lib/member-lifecycle"
);

const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("workspace disposal during the purge", () => {
  let orgId: string;
  const createdMemberIds: string[] = [];

  /**
   * A member already past their grace period, with a Workspace account.
   *
   * The Workspace id is unique per member because the purge is global — a
   * member left behind by an earlier test in this file is still due, and gets
   * retried by every later run. Asserting on a shared id would make one test's
   * leftovers look like another test's bug.
   */
  async function makeDueMember(options?: {
    workspaceUserId?: string | null;
    attempts?: number;
  }) {
    const expired = new Date();
    expired.setDate(expired.getDate() - 1);
    const workspaceUserId = `google-${Math.random().toString(36).slice(2)}`;

    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        userId: null,
        firstName: "Workspace",
        lastName: "Purge",
        email: `wp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
        status: "deleted",
        deletedAt: expired,
        purgeAfter: expired,
        workspaceUserId:
          options?.workspaceUserId === undefined
            ? workspaceUserId
            : options.workspaceUserId,
        workspaceUserEmail: "someone@example.test",
        workspacePurgeAttempts: options?.attempts ?? 0,
      })
      .returning({ id: tenantMembers.id });

    createdMemberIds.push(member.id);
    return { memberId: member.id, workspaceUserId };
  }

  async function memberExists(memberId: string) {
    const rows = await db
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(eq(tenantMembers.id, memberId));
    return rows.length > 0;
  }

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `wp-test-${Date.now()}`,
        name: "Workspace purge test org",
      })
      .returning({ id: organizations.id });

    orgId = organization.id;
  });

  beforeEach(() => {
    deleteWorkspaceUser.mockReset();
  });

  afterAll(async () => {
    if (createdMemberIds.length > 0) {
      await db
        .delete(tenantMembers)
        .where(inArray(tenantMembers.id, createdMemberIds));
    }

    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }

    await pool.end();
  });

  it("deletes the Workspace account before erasing the member", async () => {
    deleteWorkspaceUser.mockResolvedValue({ deleted: true, alreadyGone: false });

    const { memberId, workspaceUserId } = await makeDueMember();
    const result = await purgeDeletedMembers();

    expect(deleteWorkspaceUser).toHaveBeenCalledWith(orgId, workspaceUserId);
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    expect(await memberExists(memberId)).toBe(false);
  });

  it("keeps the member row when the Workspace delete fails", async () => {
    deleteWorkspaceUser.mockRejectedValue(new Error("503 backend error"));

    const { memberId } = await makeDueMember();
    const result = await purgeDeletedMembers();

    // The whole point: the row survives, because it is the only thing that
    // still knows an account needs deleting.
    expect(await memberExists(memberId)).toBe(true);
    expect(result.deletedCount).toBe(0);
    expect(result.workspaceFailureCount).toBeGreaterThanOrEqual(1);

    const [member] = await db
      .select({
        attempts: tenantMembers.workspacePurgeAttempts,
        lastError: tenantMembers.workspacePurgeLastError,
      })
      .from(tenantMembers)
      .where(eq(tenantMembers.id, memberId));

    expect(member.attempts).toBe(1);
    expect(member.lastError).toContain("503");
  });

  it("stops retrying and reports a member stuck after repeated failures", async () => {
    deleteWorkspaceUser.mockRejectedValue(new Error("permission denied"));

    const { memberId, workspaceUserId } = await makeDueMember({
      attempts: MAX_WORKSPACE_PURGE_ATTEMPTS - 1,
    });
    const result = await purgeDeletedMembers();

    expect(result.stalledMemberIds).toContain(memberId);
    expect(await memberExists(memberId)).toBe(true);

    // Already at the cap, so the next run must not touch this account again.
    deleteWorkspaceUser.mockClear();
    await purgeDeletedMembers();

    expect(deleteWorkspaceUser).not.toHaveBeenCalledWith(orgId, workspaceUserId);
    expect(await memberExists(memberId)).toBe(true);
  });

  it("erases the member when Workspace is no longer connected", async () => {
    deleteWorkspaceUser.mockRejectedValue(new FakeNotConnectedError());

    const { memberId } = await makeDueMember();
    await purgeDeletedMembers();

    // The account can never be deleted from here, and holding personal data
    // past its retention period to keep a pointer that no longer works is the
    // worse of the two failures.
    expect(await memberExists(memberId)).toBe(false);
  });

  it("does not call Google for a member with no Workspace account", async () => {
    deleteWorkspaceUser.mockResolvedValue({ deleted: true, alreadyGone: false });

    const { memberId } = await makeDueMember({ workspaceUserId: null });
    await purgeDeletedMembers();

    expect(await memberExists(memberId)).toBe(false);
    // Nothing was asked of Google on this member's behalf.
    expect(
      deleteWorkspaceUser.mock.calls.some(([, key]) => key == null),
    ).toBe(false);
  });
});
