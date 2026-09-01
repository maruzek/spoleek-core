import { and, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
  groupWorkspaceLinks,
  organizations,
  tenantMembers,
  workspaceGroupMemberLinks,
  workspaceSyncOperations,
  type GroupWorkspaceLink,
  type MembershipStatus,
  type WorkspaceGroupRole,
} from "@/server/db/schema";
import {
  getWorkspaceGroup,
  listWorkspaceGroupMembers,
} from "@/server/lib/workspace/client";
import { resolvePreferredEmail } from "@/server/lib/preferred-email";
import type { WorkspaceLinkPlanRow } from "@/lib/workspace-group-links";
import {
  computeGroupPlan,
  normalizeAddress,
  strongestRole,
  type DesiredMember,
  type GroupSyncPlan,
} from "@/server/lib/workspace/reconcile";

/**
 * Statuses that should not appear in a Workspace group. Everyone else —
 * including invited and pending members — is synced, because their Spoleek
 * group membership row already exists and admins expect the mailing list to
 * match the roster they see.
 */
const EXCLUDED_MEMBER_STATUSES: MembershipStatus[] = [
  "deleted",
  "archived",
  "suspended",
];

export type SkippedMember = {
  memberId: string;
  name: string;
  reason: "no_workspace_account" | "no_email";
};

export type DesiredResolution = {
  desired: DesiredMember[];
  skipped: SkippedMember[];
};

function displayName(firstName: string, lastName: string, email: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email || "Unnamed member";
}

export type LinkConfig = {
  groupId: string;
  memberRole: WorkspaceGroupRole;
  adminRole: WorkspaceGroupRole;
  includeExternal: boolean;
};

async function loadLinkConfigs(
  orgId: string,
  workspaceGroupId: string,
): Promise<LinkConfig[]> {
  return db
    .select({
      groupId: groupWorkspaceLinks.groupId,
      memberRole: groupWorkspaceLinks.memberRole,
      adminRole: groupWorkspaceLinks.adminRole,
      includeExternal: groupWorkspaceLinks.includeExternal,
    })
    .from(groupWorkspaceLinks)
    .where(
      and(
        eq(groupWorkspaceLinks.orgId, orgId),
        eq(groupWorkspaceLinks.workspaceGroupId, workspaceGroupId),
        eq(groupWorkspaceLinks.isEnabled, true),
        eq(groupWorkspaceLinks.direction, "push"),
      ),
    );
}

/**
 * The desired roster for one Google group, as the **union over every enabled
 * push link** pointing at it. Computing it per Google group rather than per
 * Spoleek group is what stops two Spoleek groups linked to `all-staff@` from
 * fighting: each would otherwise consider the other's members "not desired".
 *
 * `extraLinks` lets the link dialog preview a link that has not been saved yet
 * without writing a placeholder row.
 */
export async function resolveDesiredMembers(
  orgId: string,
  workspaceGroupId: string,
  extraLinks: LinkConfig[] = [],
): Promise<DesiredResolution> {
  const configs = [
    ...(await loadLinkConfigs(orgId, workspaceGroupId)),
    ...extraLinks,
  ];

  if (configs.length === 0) {
    return { desired: [], skipped: [] };
  }

  const configsByGroupId = new Map<string, LinkConfig[]>();
  for (const config of configs) {
    const list = configsByGroupId.get(config.groupId) ?? [];
    list.push(config);
    configsByGroupId.set(config.groupId, list);
  }

  const [org] = await db
    .select({
      defaultEmailPreference: organizations.defaultEmailPreference,
      workspaceConnectedAt: organizations.workspaceConnectedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const rows = await db
    .select({
      memberId: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
      groupId: groupMemberships.groupId,
      groupRole: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        inArray(groupMemberships.groupId, [...configsByGroupId.keys()]),
        notInArray(tenantMembers.status, EXCLUDED_MEMBER_STATUSES),
      ),
    );

  const byAddress = new Map<string, DesiredMember>();
  const skipped = new Map<string, SkippedMember>();

  for (const row of rows) {
    for (const config of configsByGroupId.get(row.groupId) ?? []) {
      const wantedRole: WorkspaceGroupRole =
        row.groupRole === "group_admin" ? config.adminRole : config.memberRole;
      const name = displayName(row.firstName, row.lastName, row.email);

      const address = row.workspaceUserEmail
        ? normalizeAddress(row.workspaceUserEmail)
        : config.includeExternal
          ? resolvePreferredEmail({
              personalEmail: row.email,
              workspaceEmail: null,
              memberPreference: row.preferredEmail,
              orgDefault: org?.defaultEmailPreference ?? "personal",
              workspaceReady: Boolean(org?.workspaceConnectedAt),
            })
          : null;

      if (!address) {
        skipped.set(row.memberId, {
          memberId: row.memberId,
          name,
          reason: row.email ? "no_workspace_account" : "no_email",
        });
        continue;
      }

      const normalized = normalizeAddress(address);
      const existing = byAddress.get(normalized);
      byAddress.set(
        normalized,
        existing
          ? {
              address: normalized,
              role: strongestRole(existing.role, wantedRole),
              memberId: existing.memberId ?? row.memberId,
              name: existing.name ?? name,
            }
          : {
              address: normalized,
              role: wantedRole,
              memberId: row.memberId,
              name,
            },
      );
    }
  }

  // Someone reachable through one link is not "skipped" just because another
  // link could not resolve an address for them.
  for (const entry of byAddress.values()) {
    if (entry.memberId) skipped.delete(entry.memberId);
  }

  return { desired: [...byAddress.values()], skipped: [...skipped.values()] };
}

/** Addresses the ledger says Spoleek put into this Google group. */
export async function loadOwnedAddresses(orgId: string, workspaceGroupId: string) {
  const rows = await db
    .select({ address: workspaceGroupMemberLinks.address })
    .from(workspaceGroupMemberLinks)
    .where(
      and(
        eq(workspaceGroupMemberLinks.orgId, orgId),
        eq(workspaceGroupMemberLinks.workspaceGroupId, workspaceGroupId),
      ),
    );

  return new Set(rows.map((row) => row.address));
}

export type LinkSyncPreview = {
  plan: GroupSyncPlan;
  skipped: SkippedMember[];
  workspaceGroupEmail: string;
  workspaceGroupName: string | null;
};

/**
 * Reads both sides and computes the plan. Never writes to Google — the caller
 * decides whether to show it (dry run) or enqueue it.
 */
export async function planLinkSync(
  link: Pick<
    GroupWorkspaceLink,
    "orgId" | "workspaceGroupId" | "workspaceGroupEmail" | "direction" | "removalPolicy"
  >,
  extraLinks: LinkConfig[] = [],
): Promise<LinkSyncPreview> {
  const group = await getWorkspaceGroup(link.orgId, link.workspaceGroupId);

  if (!group) {
    throw new Error(
      `The Google group ${link.workspaceGroupEmail} no longer exists. Unlink it or point the link at a different group.`,
    );
  }

  const [actual, { desired, skipped }, owned] = await Promise.all([
    listWorkspaceGroupMembers(link.orgId, link.workspaceGroupId),
    resolveDesiredMembers(link.orgId, link.workspaceGroupId, extraLinks),
    loadOwnedAddresses(link.orgId, link.workspaceGroupId),
  ]);

  const plan = computeGroupPlan({
    desired,
    actual,
    owned,
    // An observe link never deletes anything, so every unexpected address is
    // reported as drift instead.
    removalPolicy: link.direction === "observe" ? "keep" : link.removalPolicy,
  });

  return {
    plan,
    skipped,
    workspaceGroupEmail: group.email,
    workspaceGroupName: group.name,
  };
}

/**
 * Flatten a plan into table rows. Addresses we are removing or leaving alone
 * are matched back to a Spoleek member where one exists, so the admin reads
 * names rather than a column of email addresses.
 */
export async function buildPlanRows(
  orgId: string,
  plan: GroupSyncPlan,
  skipped: SkippedMember[],
): Promise<WorkspaceLinkPlanRow[]> {
  const unnamed = [
    ...plan.remove.map((entry) => entry.address),
    ...plan.drift.map((entry) => entry.address),
  ];

  const namesByAddress = new Map<string, string>();

  if (unnamed.length > 0) {
    const rows = await db
      .select({
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        workspaceUserEmail: tenantMembers.workspaceUserEmail,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          or(
            inArray(sql`lower(${tenantMembers.workspaceUserEmail})`, unnamed),
            inArray(sql`lower(${tenantMembers.email})`, unnamed),
          ),
        ),
      );

    for (const row of rows) {
      const name = displayName(row.firstName, row.lastName, row.email);
      for (const candidate of [row.workspaceUserEmail, row.email]) {
        if (candidate) namesByAddress.set(normalizeAddress(candidate), name);
      }
    }
  }

  return [
    ...plan.add.map((entry) => ({
      action: "add" as const,
      address: entry.address,
      name: entry.name,
      currentRole: null,
      nextRole: entry.role,
      note: null,
    })),
    ...plan.roleChange.map((entry) => ({
      action: "role_change" as const,
      address: entry.address,
      name: entry.name,
      currentRole: entry.from,
      nextRole: entry.to,
      note: null,
    })),
    ...plan.remove.map((entry) => ({
      action: "remove" as const,
      address: entry.address,
      name: namesByAddress.get(entry.address) ?? null,
      currentRole: entry.role,
      nextRole: null,
      note: "No longer in this group",
    })),
    ...plan.drift.map((entry) => ({
      action: "drift" as const,
      address: entry.address,
      name: namesByAddress.get(entry.address) ?? null,
      currentRole: entry.role,
      nextRole: null,
      note: "In the Google group but not in Spoleek",
    })),
    ...plan.adopt.map((entry) => ({
      action: "adopt" as const,
      address: entry.address,
      name: entry.name,
      currentRole: entry.role,
      nextRole: entry.role,
      note: "Already a member — Spoleek will manage it from now on",
    })),
    ...skipped.map((entry) => ({
      action: "skip" as const,
      address: "",
      name: entry.name,
      currentRole: null,
      nextRole: null,
      note:
        entry.reason === "no_workspace_account"
          ? "No Workspace account"
          : "No email address",
    })),
  ];
}

type Enqueueable = {
  kind: "add_member" | "remove_member" | "update_role";
  address: string;
  role: WorkspaceGroupRole | null;
  memberId: string | null;
};

export async function enqueueOperations(
  orgId: string,
  linkId: string,
  operations: Enqueueable[],
  tx: Pick<typeof db, "insert"> = db,
) {
  if (operations.length === 0) return 0;

  await tx.insert(workspaceSyncOperations).values(
    operations.map((operation) => ({
      orgId,
      linkId,
      kind: operation.kind,
      address: normalizeAddress(operation.address),
      role: operation.role,
      memberId: operation.memberId,
    })),
  );

  return operations.length;
}

/**
 * Turn a plan into queued work. `adopt` needs no API call — the addresses are
 * already in the Google group and already desired, so claiming them is a pure
 * ledger write.
 */
export async function applyPlan(
  link: Pick<GroupWorkspaceLink, "id" | "orgId" | "workspaceGroupId" | "direction">,
  plan: GroupSyncPlan,
) {
  if (link.direction === "observe") {
    return { queued: 0, adopted: 0 };
  }

  const operations: Enqueueable[] = [
    ...plan.add.map((entry) => ({
      kind: "add_member" as const,
      address: entry.address,
      role: entry.role,
      memberId: entry.memberId,
    })),
    ...plan.roleChange.map((entry) => ({
      kind: "update_role" as const,
      address: entry.address,
      role: entry.to,
      memberId: entry.memberId,
    })),
    ...plan.remove.map((entry) => ({
      kind: "remove_member" as const,
      address: entry.address,
      role: null,
      memberId: null,
    })),
  ];

  const queued = await enqueueOperations(link.orgId, link.id, operations);

  if (plan.adopt.length > 0) {
    await db
      .insert(workspaceGroupMemberLinks)
      .values(
        plan.adopt.map((entry) => ({
          orgId: link.orgId,
          linkId: link.id,
          workspaceGroupId: link.workspaceGroupId,
          address: entry.address,
          memberId: entry.memberId,
        })),
      )
      .onConflictDoNothing();
  }

  return { queued, adopted: plan.adopt.length };
}

/**
 * Create a link and run its first sync. Shared by the link dialog and by group
 * creation, so a group linked at creation time behaves identically to one
 * linked afterwards.
 */
export async function createLinkForGroup(
  orgId: string,
  groupId: string,
  input: {
    workspaceGroupKey: string;
    direction: "push" | "observe";
    memberRole: WorkspaceGroupRole;
    adminRole: WorkspaceGroupRole;
    removalPolicy: "remove_owned" | "remove_all" | "keep";
    includeExternal: boolean;
  },
) {
  const target = await getWorkspaceGroup(orgId, input.workspaceGroupKey);

  if (!target) {
    return { link: null, queued: 0, adopted: 0, plan: null };
  }

  const [link] = await db
    .insert(groupWorkspaceLinks)
    .values({
      orgId,
      groupId,
      workspaceGroupId: target.id,
      workspaceGroupEmail: target.email,
      workspaceGroupName: target.name,
      direction: input.direction,
      memberRole: input.memberRole,
      adminRole: input.adminRole,
      removalPolicy: input.removalPolicy,
      includeExternal: input.includeExternal,
    })
    .onConflictDoNothing()
    .returning();

  if (!link) {
    return { link: null, queued: 0, adopted: 0, plan: null };
  }

  const preview = await planLinkSync(link);
  const applied = await applyPlan(link, preview.plan);

  return { link, ...applied, plan: preview.plan };
}

/**
 * Fast path for a membership mutation. Deliberately DB-only: it decides what to
 * enqueue without calling Google, so assigning 200 members costs one query
 * instead of 200 round trips. Correctness for removals comes from re-deriving
 * the union — an address is only removed once no remaining link wants it.
 */
export async function enqueueMemberSyncForGroup(
  orgId: string,
  groupId: string,
  memberIds: string[],
) {
  if (memberIds.length === 0) return;

  const links = await db
    .select()
    .from(groupWorkspaceLinks)
    .where(
      and(
        eq(groupWorkspaceLinks.orgId, orgId),
        eq(groupWorkspaceLinks.groupId, groupId),
        eq(groupWorkspaceLinks.isEnabled, true),
        eq(groupWorkspaceLinks.direction, "push"),
      ),
    );

  if (links.length === 0) return;

  const members = await db
    .select({
      id: tenantMembers.id,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        inArray(tenantMembers.id, memberIds),
        ne(tenantMembers.status, "deleted"),
      ),
    );

  const [org] = await db
    .select({
      defaultEmailPreference: organizations.defaultEmailPreference,
      workspaceConnectedAt: organizations.workspaceConnectedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  for (const link of links) {
    const { desired } = await resolveDesiredMembers(orgId, link.workspaceGroupId);
    const desiredByAddress = new Map(desired.map((entry) => [entry.address, entry]));
    const owned = await loadOwnedAddresses(orgId, link.workspaceGroupId);

    const operations: Enqueueable[] = [];

    for (const member of members) {
      const raw = member.workspaceUserEmail
        ? member.workspaceUserEmail
        : link.includeExternal
          ? resolvePreferredEmail({
              personalEmail: member.email,
              workspaceEmail: null,
              memberPreference: member.preferredEmail,
              orgDefault: org?.defaultEmailPreference ?? "personal",
              workspaceReady: Boolean(org?.workspaceConnectedAt),
            })
          : null;

      if (!raw) continue;

      const address = normalizeAddress(raw);
      const want = desiredByAddress.get(address);

      if (want) {
        operations.push({
          kind: "add_member",
          address,
          role: want.role,
          memberId: want.memberId,
        });
        // `add` is a no-op for someone already in the group, so a non-default
        // role needs its own idempotent patch to actually take effect.
        if (want.role !== "member") {
          operations.push({
            kind: "update_role",
            address,
            role: want.role,
            memberId: want.memberId,
          });
        }
        continue;
      }

      if (link.removalPolicy === "keep") continue;
      if (link.removalPolicy === "remove_owned" && !owned.has(address)) continue;

      operations.push({
        kind: "remove_member",
        address,
        role: null,
        memberId: null,
      });
    }

    await enqueueOperations(orgId, link.id, operations);
  }
}
