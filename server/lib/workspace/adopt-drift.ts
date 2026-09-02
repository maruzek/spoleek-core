import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
  tenantMembers,
  workspaceGroupMemberLinks,
} from "@/server/db/schema";
import { getWorkspaceUser } from "@/server/lib/workspace/client";
import { normalizeAddress } from "@/server/lib/workspace/reconcile";

export type AdoptTarget = {
  id: string;
  orgId: string;
  groupId: string;
  workspaceGroupId: string;
  includeExternal: boolean;
};

/**
 * Why an address could not be adopted. Each one means the same thing in
 * practice: adopting would not make Spoleek want this exact address, so the
 * next reconcile would report it as drift all over again — and, worse, the
 * ledger row would make `remove_owned` delete it from Google.
 */
export type AdoptSkipReason =
  | "external_not_included"
  | "member_syncs_another_address"
  | "alias_of_another_address";

export type AdoptOutcome =
  | { status: "adopted"; memberId: string; createdMember: boolean }
  | { status: "skipped"; reason: AdoptSkipReason };

export const adoptSkipMessages: Record<AdoptSkipReason, string> = {
  external_not_included:
    "is not a Workspace account. Turn on “Include members without a Workspace account” for this link first, or ignore it.",
  member_syncs_another_address:
    "belongs to a member who syncs under a different address, so adopting it would not stick.",
  alias_of_another_address:
    "is an alias of another Workspace account. Adopt that account's primary address instead.",
};

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function lower(value: string | null) {
  return value ? value.trim().toLowerCase() : null;
}

/**
 * Find the member this address already belongs to. A Workspace address is the
 * stronger identity — it is provisioned by us and unique in the directory — so
 * it wins over a personal address that merely happens to match.
 */
async function findMemberForAddress(orgId: string, address: string) {
  const candidates = await db
    .select({
      id: tenantMembers.id,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        sql`${tenantMembers.status} <> 'deleted'`,
        sql`(lower(${tenantMembers.workspaceUserEmail}) = ${address} or lower(${tenantMembers.email}) = ${address})`,
      ),
    );

  return (
    candidates.find((row) => lower(row.workspaceUserEmail) === address) ??
    candidates[0] ??
    null
  );
}

/**
 * Turn one drift address into a Spoleek membership.
 *
 * A brand-new member is created as `pending`, not `active`: the address proves
 * someone put them in the Google group, not that the organization has approved
 * them. Pending members are still synced, so the adoption survives the next
 * reconcile. The ledger row is written directly rather than queued — the
 * address is already in the Google group, so adopting costs no API call.
 */
export async function adoptDriftAddress(
  link: AdoptTarget,
  rawAddress: string,
): Promise<AdoptOutcome> {
  const address = normalizeAddress(rawAddress);
  const existing = await findMemberForAddress(link.orgId, address);

  let memberId: string;
  let createdMember = false;

  if (existing) {
    const isTheirWorkspaceAddress = lower(existing.workspaceUserEmail) === address;
    const isTheirOnlyAddress =
      !existing.workspaceUserEmail && lower(existing.email) === address;

    if (!isTheirWorkspaceAddress) {
      if (!isTheirOnlyAddress) {
        return { status: "skipped", reason: "member_syncs_another_address" };
      }
      if (!link.includeExternal) {
        return { status: "skipped", reason: "external_not_included" };
      }
    }

    memberId = existing.id;
  } else {
    // The directory gives us a real name for a Workspace account; an external
    // subscriber has none, and the address stands in for it.
    const directoryUser = await getWorkspaceUser(link.orgId, address).catch(
      () => null,
    );

    if (directoryUser && lower(directoryUser.primaryEmail) !== address) {
      return { status: "skipped", reason: "alias_of_another_address" };
    }

    if (!directoryUser && !link.includeExternal) {
      return { status: "skipped", reason: "external_not_included" };
    }

    const { firstName, lastName } = splitFullName(directoryUser?.fullName ?? "");

    const [inserted] = await db
      .insert(tenantMembers)
      .values({
        orgId: link.orgId,
        email: address,
        firstName,
        lastName,
        status: "pending",
        workspaceUserEmail: directoryUser?.primaryEmail ?? null,
        workspaceUserId: directoryUser?.id ?? null,
        workspaceProvisionedAt: directoryUser ? new Date() : null,
      })
      .returning({ id: tenantMembers.id });

    memberId = inserted.id;
    createdMember = true;
  }

  await db
    .insert(groupMemberships)
    .values({
      orgId: link.orgId,
      groupId: link.groupId,
      memberId,
      role: "member" as const,
    })
    .onConflictDoNothing();

  await db
    .insert(workspaceGroupMemberLinks)
    .values({
      orgId: link.orgId,
      linkId: link.id,
      workspaceGroupId: link.workspaceGroupId,
      address,
      memberId,
    })
    .onConflictDoNothing();

  return { status: "adopted", memberId, createdMember };
}
