import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { makeViewer } from "./helpers/viewer";

/**
 * `approveMember` is the `pending → active | invited` transition. These tests
 * drive it through every route the settings/flags matrix produces and assert
 * what each leaves in the database — and, for a refusal, that it leaves
 * nothing.
 *
 * The three network edges are faked: Google's directory (creating the
 * account) and Better Auth (the activation invite, which also needs a request
 * because it reads `headers()`) are mocked before anything that reaches them
 * is imported; the mailer takes its in-memory adapter through `installMailer`.
 *
 * Needs a database. Creates its own organizations and removes them afterwards.
 */
const createWorkspaceUser = vi.fn();
const requestPasswordReset = vi.fn(async (_input: unknown) => ({ status: true }));

vi.mock("@/server/lib/workspace/client", () => {
  class WorkspaceApiError extends Error {}
  class WorkspaceFieldValidationError extends Error {}
  class WorkspaceNotConnectedError extends Error {}
  return {
    createWorkspaceUser: (...args: unknown[]) => createWorkspaceUser(...args),
    deleteWorkspaceUser: vi.fn(),
    WorkspaceApiError,
    WorkspaceFieldValidationError,
    WorkspaceNotConnectedError,
  };
});

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    $context: Promise.resolve({}),
    api: { requestPasswordReset: (input: unknown) => requestPasswordReset(input) },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const { db, pool } = await import("@/server/db");
const {
  memberAuthEvents,
  memberCustomFieldValues,
  memberCustomFields,
  memberInvites,
  memberPayments,
  organizations,
  tenantMembers,
  users,
} = await import("@/server/db/schema");
const { approveMember, MemberApprovalError } = await import(
  "@/server/lib/member-lifecycle"
);
const { createMemoryMailer, installMailer } = await import("@/server/notifications/send");

const mailer = createMemoryMailer();
installMailer(mailer);

const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

type OrgOverrides = Partial<typeof organizations.$inferInsert>;

const noFlags = {
  acknowledgeWorkspaceUnavailable: false,
  skipWorkspaceAccount: false,
  acknowledgeUnderAge: false,
  workspaceEmail: null,
  role: "member" as const,
};

suite("approving a member", () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let actorUserId: string;

  beforeAll(async () => {
    actorUserId = `approval-test-actor-${stamp}`;
    await db.insert(users).values({
      id: actorUserId,
      name: "Approving admin",
      email: `${actorUserId}@example.test`,
    });
    createdUserIds.push(actorUserId);
  });

  beforeEach(() => {
    createWorkspaceUser.mockReset();
    mailer.reset();
    requestPasswordReset.mockClear();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await pool.end();
  });

  async function makeOrg(overrides: OrgOverrides = {}) {
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `approval-test-${stamp}-${createdOrgIds.length}`,
        name: "Approval test org",
        setupAuthStrategy: "google",
        ...overrides,
      })
      .returning();

    createdOrgIds.push(organization.id);
    return organization;
  }

  async function makePendingMember(orgId: string, overrides: Partial<typeof tenantMembers.$inferInsert> = {}) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        userId: null,
        firstName: "Pending",
        lastName: "Applicant",
        email: `pending-${stamp}-${Math.random().toString(36).slice(2)}@example.test`,
        role: "member",
        status: "pending",
        ...overrides,
      })
      .returning();

    return member;
  }

  function viewerFor(organization: typeof organizations.$inferSelect) {
    return makeViewer({
      orgId: organization.id,
      organization,
      member: { role: "org_admin", userId: actorUserId },
    });
  }

  async function readMember(memberId: string) {
    const [row] = await db
      .select({ status: tenantMembers.status, role: tenantMembers.role })
      .from(tenantMembers)
      .where(eq(tenantMembers.id, memberId));
    return row;
  }

  async function approvalEvents(memberId: string) {
    return db
      .select({ metadata: memberAuthEvents.metadata, actorUserId: memberAuthEvents.actorUserId })
      .from(memberAuthEvents)
      .where(
        and(
          eq(memberAuthEvents.memberId, memberId),
          eq(memberAuthEvents.eventType, "member_approved"),
        ),
      );
  }

  it("direct route: activates, writes the role and records who approved", async () => {
    const organization = await makeOrg();
    const member = await makePendingMember(organization.id);

    const result = await approveMember(viewerFor(organization), member, {
      ...noFlags,
      role: "leader",
    });

    expect(result).toMatchObject({
      success: true,
      transition: { from: "pending", to: "active", via: "direct", role: "leader" },
      workspace: null,
      invite: null,
    });
    expect(await readMember(member.id)).toEqual({ status: "active", role: "leader" });

    const events = await approvalEvents(member.id);
    expect(events).toHaveLength(1);
    expect(events[0].actorUserId).toBe(actorUserId);
    expect(events[0].metadata).toMatchObject({ via: "direct", status: "active", role: "leader" });
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(createWorkspaceUser).not.toHaveBeenCalled();
  });

  it("invite route: leaves the member invited and sends the activation email after the commit", async () => {
    const organization = await makeOrg({ setupAuthStrategy: "email-password" });
    const member = await makePendingMember(organization.id);

    // The invite links to a Better Auth user; an existing one is reused, so no
    // fake `createUser` is needed.
    const inviteUserId = `approval-test-invitee-${stamp}`;
    await db.insert(users).values({ id: inviteUserId, name: "Invitee", email: member.email! });
    createdUserIds.push(inviteUserId);

    const result = await approveMember(viewerFor(organization), member, noFlags);

    expect(result).toMatchObject({
      success: true,
      transition: { to: "invited", via: "invite" },
      invite: { sent: true, reason: "sent" },
    });
    expect((await readMember(member.id)).status).toBe("invited");
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);

    const [invite] = await db
      .select({ provisionedUserId: memberInvites.provisionedUserId })
      .from(memberInvites)
      .where(eq(memberInvites.memberId, member.id));
    expect(invite.provisionedUserId).toBe(inviteUserId);
  });

  it("workspace route: provisions the account, then activates", async () => {
    const organization = await makeOrg({
      workspaceModuleEnabled: true,
      workspaceConnectedAt: new Date(),
      workspaceDomain: "example.test",
    });
    const member = await makePendingMember(organization.id);
    createWorkspaceUser.mockResolvedValue({ id: "google-1", primaryEmail: "jane@example.test" });

    const result = await approveMember(viewerFor(organization), member, {
      ...noFlags,
      workspaceEmail: "Jane@Example.test",
    });

    expect(result).toMatchObject({
      success: true,
      transition: { to: "active", via: "workspace" },
      workspace: { primaryEmail: "jane@example.test" },
    });
    expect(createWorkspaceUser).toHaveBeenCalledWith(
      organization.id,
      expect.objectContaining({ primaryEmail: "jane@example.test" }),
    );
    // The welcome carries the temporary password, so it goes to the personal
    // address, never to the mailbox it unlocks.
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(member.email);
    expect((await readMember(member.id)).status).toBe("active");
    expect((await approvalEvents(member.id))[0].metadata).toMatchObject({
      via: "workspace",
      workspaceUserEmail: "jane@example.test",
    });
  });

  it("workspace route: a refused account leaves the member pending for a retry that reuses the payment", async () => {
    const organization = await makeOrg({
      workspaceModuleEnabled: true,
      workspaceConnectedAt: new Date(),
      workspaceDomain: "example.test",
      membershipManagementMode: "periodic_renewal",
      membershipFeeEnabled: true,
      membershipFeeAmount: 500,
      membershipRenewalMonth: 1,
      membershipRenewalDay: 1,
    });
    const member = await makePendingMember(organization.id);
    const viewer = viewerFor(organization);
    const flags = { ...noFlags, workspaceEmail: "jane@example.test" };

    createWorkspaceUser.mockRejectedValueOnce(new Error("Google said no"));
    const failed = await approveMember(viewer, member, flags);

    expect(failed).toEqual({
      success: false,
      workspace: { error: "Google said no", reason: null },
    });
    expect((await readMember(member.id)).status).toBe("pending");
    expect(await approvalEvents(member.id)).toHaveLength(0);

    createWorkspaceUser.mockResolvedValueOnce({ id: "google-2", primaryEmail: "jane@example.test" });
    const retried = await approveMember(viewer, member, flags);

    expect(retried.success).toBe(true);
    expect((await readMember(member.id)).status).toBe("active");

    // The row created before the failed provisioning is the one the retry's
    // welcome email carried — one payment, not two.
    const payments = await db
      .select({ id: memberPayments.id })
      .from(memberPayments)
      .where(eq(memberPayments.memberId, member.id));
    expect(payments).toHaveLength(1);
  });

  it("generates the membership payment on every route that charges one", async () => {
    const organization = await makeOrg({
      membershipManagementMode: "periodic_renewal",
      membershipFeeEnabled: true,
      membershipFeeAmount: 500,
      membershipRenewalMonth: 1,
      membershipRenewalDay: 1,
    });
    const member = await makePendingMember(organization.id);

    await approveMember(viewerFor(organization), member, noFlags);

    const payments = await db
      .select({ status: memberPayments.status, amount: memberPayments.amount })
      .from(memberPayments)
      .where(eq(memberPayments.memberId, member.id));
    expect(payments).toEqual([{ status: "pending", amount: 500 }]);
  });

  it("refuses a half-connected Workspace module until acknowledged, and writes nothing", async () => {
    const organization = await makeOrg({ workspaceModuleEnabled: true });
    const member = await makePendingMember(organization.id);
    const viewer = viewerFor(organization);

    await expect(approveMember(viewer, member, noFlags)).rejects.toMatchObject({
      name: "MemberApprovalError",
      reason: "workspace_not_connected",
    });
    expect((await readMember(member.id)).status).toBe("pending");
    expect(await approvalEvents(member.id)).toHaveLength(0);

    const result = await approveMember(viewer, member, {
      ...noFlags,
      acknowledgeWorkspaceUnavailable: true,
    });
    expect(result).toMatchObject({ success: true, transition: { via: "direct" } });
  });

  it("refuses an under-age applicant unless the admin acknowledges it", async () => {
    const organization = await makeOrg({ registrationMinimumAge: 18 });
    const [field] = await db
      .insert(memberCustomFields)
      .values({
        orgId: organization.id,
        key: "date_of_birth",
        label: "Date of birth",
        type: "date",
        stage: "registration",
        isDateOfBirth: true,
      })
      .returning({ id: memberCustomFields.id });
    const member = await makePendingMember(organization.id);
    const twelveYearsAgo = new Date();
    twelveYearsAgo.setFullYear(twelveYearsAgo.getFullYear() - 12);
    await db.insert(memberCustomFieldValues).values({
      orgId: organization.id,
      memberId: member.id,
      fieldId: field.id,
      value: twelveYearsAgo.toISOString().slice(0, 10),
    });
    const viewer = viewerFor(organization);

    await expect(approveMember(viewer, member, noFlags)).rejects.toMatchObject({
      reason: "under_age",
      message: expect.stringContaining("12"),
    });
    expect((await readMember(member.id)).status).toBe("pending");

    const result = await approveMember(viewer, member, {
      ...noFlags,
      acknowledgeUnderAge: true,
    });
    expect(result.success).toBe(true);
  });

  it("only a pending member can be approved", async () => {
    const organization = await makeOrg();
    const member = await makePendingMember(organization.id, { status: "active" });

    await expect(
      approveMember(viewerFor(organization), member, noFlags),
    ).rejects.toBeInstanceOf(MemberApprovalError);
    expect(await approvalEvents(member.id)).toHaveLength(0);
  });

  it("a member of another organization is never approved through this viewer", async () => {
    const organization = await makeOrg();
    const other = await makeOrg();
    const member = await makePendingMember(other.id);

    await expect(
      approveMember(viewerFor(organization), member, noFlags),
    ).rejects.toMatchObject({ reason: "not_pending" });
    expect((await readMember(member.id)).status).toBe("pending");
  });
});
