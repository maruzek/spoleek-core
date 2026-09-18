import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  eventAudience,
  events,
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { upsertActiveMembership } from "@/server/lib/group-membership";
import { canAccessMemberInScope } from "@/server/lib/member-management-scope";
import { generatePaymentForMember } from "@/server/lib/payment-lifecycle";
import { resolveDesiredMembers } from "@/server/lib/workspace/group-links";
import {
  resolveJoinRequestRecipients,
  resolveRegistrationRecipients,
} from "@/server/notifications/recipients";
import { listScopedGroupIds } from "@/server/queries/access";
import { listEligibleMemberIds } from "@/server/queries/events";
import { listGroupMembers } from "@/server/queries/groups";

/**
 * The invariant behind portal self-service: a `pending` (or `declined`) row in
 * `group_memberships` is a join request, not a membership, and must be
 * invisible to everything that treats a membership as real — roster, admin
 * scope, fee generation, event targeting, notification routing, Workspace
 * sync. `activeMembership()` is what makes that true at each site; this test
 * is what keeps it true.
 *
 * Needs a database. Creates its own organization and deletes it afterwards —
 * every table hangs off `org_id` with `ON DELETE CASCADE`.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("pending join requests are not memberships", () => {
  let orgId: string;
  let categoryId: string;
  let groupId: string;
  let leaderId: string;
  let requesterId: string;
  let eventId: string;

  async function makeMember(firstName: string) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName,
        lastName: "Testcase",
        email: `${firstName.toLowerCase()}-${Date.now()}@example.test`,
        workspaceUserEmail: `${firstName.toLowerCase()}@workspace.example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id });

    return member.id;
  }

  async function membershipRow(memberId: string) {
    const [row] = await db
      .select({
        status: groupMemberships.status,
        role: groupMemberships.role,
        requestMessage: groupMemberships.requestMessage,
        requestedAt: groupMemberships.requestedAt,
        requestsBlocked: groupMemberships.requestsBlocked,
      })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.memberId, memberId)))
      .limit(1);

    return row ?? null;
  }

  /** Every "is this person a member?" reader, answered at once. */
  async function visibility(memberId: string) {
    const [roster, scoped, eligible, recipients, desired, inScope] = await Promise.all([
      listGroupMembers(orgId, groupId),
      listScopedGroupIds(orgId, memberId),
      listEligibleMemberIds(orgId, eventId),
      resolveRegistrationRecipients({ orgId, groupIds: [groupId] }),
      resolveDesiredMembers(orgId, "unused-workspace-group", {
        groupId,
        memberRole: "member",
        adminRole: "manager",
        includeExternal: false,
      }),
      canAccessMemberInScope(orgId, memberId, {
        accessLevel: "scoped",
        managedGroupIds: [groupId],
      }),
    ]);

    return {
      onRoster: roster.some((row) => row.memberId === memberId),
      hasAdminScope: scoped.includes(groupId),
      targetedByEvent: eligible.has(memberId),
      notified: recipients.some((recipient) => recipient.reason === "group_admin"
        && recipient.email?.startsWith(memberId === leaderId ? "leader" : "requester")),
      syncedToWorkspace: desired.desired.some((entry) => entry.memberId === memberId),
      inManagementScope: inScope,
    };
  }

  beforeAll(async () => {
    const suffix = Date.now();

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Membership Status Test Org",
        slug: `membership-status-${suffix}`,
        membershipManagementMode: "periodic_renewal",
        membershipFeeEnabled: true,
        membershipFeeAmount: 25_000,
        membershipFeeCurrency: "CZK",
        membershipRenewalMonth: 1,
        membershipRenewalDay: 1,
        emailNotifyRegistration: true,
        emailNotifyRegistrationOrgAdmins: false,
      })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [category] = await db
      .insert(groupCategories)
      .values({
        orgId,
        name: "Sections",
        slug: "sections",
        managesMembershipFees: true,
        notifyOnRegistration: true,
        showInRegistration: true,
        groupAdminsManageMembers: true,
      })
      .returning({ id: groupCategories.id });
    categoryId = category.id;

    const [group] = await db
      .insert(groups)
      .values({
        orgId,
        categoryId,
        name: "Climbing",
        slug: "climbing",
        joinPolicy: "request_to_join",
        feeAmount: 30_000,
      })
      .returning({ id: groups.id });
    groupId = group.id;

    const [event] = await db
      .insert(events)
      .values({
        orgId,
        slug: `climbing-night-${suffix}`,
        title: "Climbing night",
        ownerType: "group",
        ownerGroupId: groupId,
        visibility: "targeted",
        status: "published",
        startsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: events.id });
    eventId = event.id;
    await db.insert(eventAudience).values({ orgId, eventId, kind: "group", groupId });

    leaderId = await makeMember("Leader");
    requesterId = await makeMember("Requester");

    // The leader is a real admin; the requester has only asked.
    await db.insert(groupMemberships).values({
      orgId,
      groupId,
      memberId: leaderId,
      role: "group_admin",
      status: "active",
    });
    await db.insert(groupMemberships).values({
      orgId,
      groupId,
      memberId: requesterId,
      role: "member",
      status: "pending",
      requestMessage: "I climb on Tuesdays",
      requestedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await pool.end();
  });

  it("the active admin is visible everywhere (the readers actually work)", async () => {
    expect(await visibility(leaderId)).toEqual({
      onRoster: true,
      hasAdminScope: true,
      targetedByEvent: true,
      notified: true,
      syncedToWorkspace: true,
      inManagementScope: true,
    });
  });

  it("a pending requester is invisible to every membership reader", async () => {
    expect(await visibility(requesterId)).toEqual({
      onRoster: false,
      hasAdminScope: false,
      targetedByEvent: false,
      notified: false,
      syncedToWorkspace: false,
      inManagementScope: false,
    });
  });

  it("a join request is routed to the group's active admins, gated by the org switch", async () => {
    const recipients = await resolveJoinRequestRecipients({ orgId, groupId });
    expect(recipients).toEqual([
      expect.objectContaining({ reason: "group_admin", email: expect.stringMatching(/^leader/) }),
    ]);

    await db
      .update(organizations)
      .set({ emailNotifyJoinRequest: false })
      .where(eq(organizations.id, orgId));
    expect(await resolveJoinRequestRecipients({ orgId, groupId })).toEqual([]);
    await db
      .update(organizations)
      .set({ emailNotifyJoinRequest: true })
      .where(eq(organizations.id, orgId));
  });

  it("a pending requester is never billed the group fee", async () => {
    const result = await generatePaymentForMember(requesterId, orgId);
    const payments = await db
      .select({ amount: memberPayments.amount })
      .from(memberPayments)
      .where(eq(memberPayments.memberId, requesterId));

    // The org-level fee may or may not apply depending on the calendar; the
    // point is that the group's 30 000 never does.
    expect(payments.every((payment) => payment.amount !== 30_000)).toBe(true);
    if (result.created) {
      expect(payments[0]?.amount).toBe(25_000);
    }
  });

  it("upsertActiveMembership approves the request by assignment", async () => {
    const result = await upsertActiveMembership(db, { orgId, groupId, memberId: requesterId });

    expect(result.previousStatus).toBe("pending");
    expect(await membershipRow(requesterId)).toMatchObject({
      status: "active",
      role: "member",
      requestMessage: null,
      requestedAt: null,
      requestsBlocked: false,
    });

    const seen = await visibility(requesterId);
    expect(seen).toMatchObject({
      onRoster: true,
      targetedByEvent: true,
      syncedToWorkspace: true,
      inManagementScope: true,
    });
    // Still a plain member, so no admin-only readers.
    expect(seen.hasAdminScope).toBe(false);
  });

  it("re-upserting an admin as a member keeps them an admin", async () => {
    const result = await upsertActiveMembership(db, { orgId, groupId, memberId: leaderId });

    expect(result.previousStatus).toBe("active");
    expect((await membershipRow(leaderId))?.role).toBe("group_admin");
  });

  it("upserting with role group_admin promotes an existing member", async () => {
    const result = await upsertActiveMembership(db, {
      orgId,
      groupId,
      memberId: requesterId,
      role: "group_admin",
    });

    expect(result.previousStatus).toBe("active");
    expect((await membershipRow(requesterId))?.role).toBe("group_admin");
  });

  it("returns null previousStatus for a brand-new row", async () => {
    const newcomerId = await makeMember("Newcomer");
    const result = await upsertActiveMembership(db, { orgId, groupId, memberId: newcomerId });

    expect(result.previousStatus).toBeNull();
    expect((await membershipRow(newcomerId))?.status).toBe("active");
  });
});
