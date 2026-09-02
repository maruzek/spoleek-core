import type {
  WorkspaceGroupRole,
  WorkspaceLinkRemovalPolicy,
} from "@/server/db/schema";

export type DesiredMember = {
  address: string;
  role: WorkspaceGroupRole;
  memberId: string | null;
  /** Shown in the preview table so a row is a person, not just an address. */
  name: string | null;
};

export type ActualMember = {
  address: string;
  role: WorkspaceGroupRole;
  /** Google's member type. `GROUP` is a nested group, not a person. */
  type?: string;
};

export type RoleChange = {
  address: string;
  memberId: string | null;
  name: string | null;
  from: WorkspaceGroupRole;
  to: WorkspaceGroupRole;
};

export type GroupSyncPlan = {
  /** Desired but not in the Google group yet. */
  add: DesiredMember[];
  /** Present and desired, but with the wrong Google role. */
  roleChange: RoleChange[];
  /** Already present and desired, but not yet in our ledger — claim them. */
  adopt: DesiredMember[];
  /** Present, not desired, and safe to delete under the removal policy. */
  remove: ActualMember[];
  /** Present, not desired, and not ours — reported, never deleted. */
  drift: ActualMember[];
};

const ROLE_RANK: Record<WorkspaceGroupRole, number> = {
  member: 0,
  manager: 1,
  owner: 2,
};

/** When several links want the same address, the strongest role wins. */
export function strongestRole(
  a: WorkspaceGroupRole,
  b: WorkspaceGroupRole,
): WorkspaceGroupRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

/**
 * The whole reconciliation decision, as a pure function: no DB, no network, no
 * clock. Every caller — link preview, membership mutation, "Sync now", the
 * nightly cron — runs this same plan so they cannot disagree.
 *
 * `owned` is the set of addresses the provenance ledger says Spoleek put in
 * this Google group. It is what separates "we should clean this up" from
 * "someone else put this here and it is not ours to delete".
 */
export function computeGroupPlan({
  desired,
  actual,
  owned,
  removalPolicy,
}: {
  desired: DesiredMember[];
  actual: ActualMember[];
  owned: Set<string>;
  removalPolicy: WorkspaceLinkRemovalPolicy;
}): GroupSyncPlan {
  const desiredByAddress = new Map<string, DesiredMember>();
  for (const entry of desired) {
    const address = normalizeAddress(entry.address);
    const existing = desiredByAddress.get(address);
    desiredByAddress.set(
      address,
      existing
        ? {
            address,
            role: strongestRole(existing.role, entry.role),
            memberId: existing.memberId ?? entry.memberId,
            name: existing.name ?? entry.name,
          }
        : { ...entry, address },
    );
  }

  const actualByAddress = new Map<string, ActualMember>();
  for (const entry of actual) {
    actualByAddress.set(normalizeAddress(entry.address), {
      ...entry,
      address: normalizeAddress(entry.address),
    });
  }

  const plan: GroupSyncPlan = {
    add: [],
    roleChange: [],
    adopt: [],
    remove: [],
    drift: [],
  };

  for (const [address, want] of desiredByAddress) {
    const have = actualByAddress.get(address);

    if (!have) {
      plan.add.push(want);
      continue;
    }

    if (have.role !== want.role) {
      plan.roleChange.push({
        address,
        memberId: want.memberId,
        name: want.name,
        from: have.role,
        to: want.role,
      });
    }

    if (!owned.has(address)) {
      plan.adopt.push(want);
    }
  }

  for (const [address, have] of actualByAddress) {
    if (desiredByAddress.has(address)) continue;

    if (removalPolicy === "keep") {
      plan.drift.push(have);
      continue;
    }

    if (removalPolicy === "remove_all" || owned.has(address)) {
      plan.remove.push(have);
      continue;
    }

    plan.drift.push(have);
  }

  return plan;
}

export function isPlanEmpty(plan: GroupSyncPlan) {
  return (
    plan.add.length === 0 &&
    plan.roleChange.length === 0 &&
    plan.remove.length === 0
  );
}
