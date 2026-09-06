/**
 * Fixture seeder for manual testing of the membership/payments module.
 *
 * Creates one shadow member per payment scenario so every state in the admin
 * table, the portal cards and the lifecycle cron can be seen at once, without
 * waiting for the renewal window (1 January + 14 days for this org).
 *
 * Usage:
 *   pnpm tsx scripts/seed-payments-test.ts --email=you@example.com
 *   pnpm tsx scripts/seed-payments-test.ts --email=a@x.cz --email=b@y.cz
 *   pnpm tsx scripts/seed-payments-test.ts --reset          # remove fixtures
 *
 * Every row it creates is tagged with firstName "PayTest", which is also what
 * --reset deletes — it never touches members you created by hand.
 */
import { and, eq, inArray } from "drizzle-orm";

import { resolveMembershipPeriod } from "@/lib/membership-period";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";

const FIXTURE_TAG = "PayTest";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const emails = args
  .filter((a) => a.startsWith("--email="))
  .map((a) => a.slice("--email=".length).trim().toLowerCase())
  .filter(Boolean);

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function vs(seed: number): string {
  return String(900000 + seed);
}

type Scenario = {
  key: string;
  lastName: string;
  memberStatus: "active" | "suspended" | "pending";
  /** null = create the member but no payment row (approval-flow test). */
  payment: null | {
    status: "pending" | "overdue" | "paid" | "cancelled";
    dueInDays: number;
    amount: number;
    paidInDays?: number;
    cancellationReason?: string;
    adminNote?: string;
    /** Bill through the fee-managing group instead of the org defaults. */
    useGroupFee?: boolean;
  };
  workspaceEmail?: boolean;
  note: string;
};

const SCENARIOS: Scenario[] = [
  {
    key: "pending",
    lastName: "Pending",
    memberStatus: "active",
    payment: { status: "pending", dueInDays: 20, amount: 10000 },
    workspaceEmail: true,
    note: "Normal pending fee, 20 days left. Portal shows a QR card.",
  },
  {
    key: "duesoon",
    lastName: "Duesoon",
    memberStatus: "active",
    payment: { status: "pending", dueInDays: 2, amount: 10000 },
    workspaceEmail: true,
    note: "Pending, due in 2 days.",
  },
  {
    key: "sweep",
    lastName: "Sweep",
    memberStatus: "active",
    payment: { status: "pending", dueInDays: -1, amount: 10000 },
    workspaceEmail: true,
    note: "Pending but already past due — the cron flips the payment to overdue and sends the overdue email. The member must stay active; only the unpaid-fees badge appears.",
  },
  {
    key: "overdue",
    lastName: "Overdue",
    memberStatus: "active",
    payment: { status: "overdue", dueInDays: -37, amount: 10000 },
    workspaceEmail: true,
    note: "Active member who is behind on fees — the roster must show 'Active' plus an unpaid-fees badge, and the 'Unpaid fees' filter must catch them.",
  },
  {
    key: "banned",
    lastName: "Banned",
    memberStatus: "suspended",
    payment: {
      status: "paid",
      dueInDays: -40,
      paidInDays: -35,
      amount: 10000,
      adminNote: "Fees settled; suspension is disciplinary.",
    },
    workspaceEmail: true,
    note: "Suspended by an admin, fees fully paid. Regression fixture: marking any payment paid must NOT flip them back to active.",
  },
  {
    key: "paid",
    lastName: "Paid",
    memberStatus: "active",
    payment: {
      status: "paid",
      dueInDays: -5,
      paidInDays: -2,
      amount: 10000,
      adminNote: "Paid by bank transfer.",
    },
    workspaceEmail: true,
    note: "Settled fee — appears under portal payment history.",
  },
  {
    key: "cancelled",
    lastName: "Cancelled",
    memberStatus: "active",
    payment: {
      status: "cancelled",
      dueInDays: 10,
      amount: 10000,
      cancellationReason: "waived",
      adminNote: "Fee waived for the current period.",
    },
    workspaceEmail: true,
    note: "Cancelled/waived fee.",
  },
  {
    key: "groupfee",
    lastName: "Groupfee",
    memberStatus: "active",
    payment: { status: "pending", dueInDays: 25, amount: 10000, useGroupFee: true },
    workspaceEmail: true,
    note: "Billed through the fee-managing group — periodKey carries :grp:, so the approval email names the group.",
  },
  {
    key: "approve",
    lastName: "Approve",
    memberStatus: "pending",
    payment: null,
    note: "Awaiting approval — approve them in the admin to exercise provisioning + the approval email with the payment block.",
  },
];

async function main() {
  const [org] = await db.select().from(organizations).limit(1);

  if (!org) {
    throw new Error("No organization found. Run pnpm db:seed or the setup wizard first.");
  }

  const existing = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, org.id), eq(tenantMembers.firstName, FIXTURE_TAG)));

  if (existing.length > 0) {
    const ids = existing.map((m) => m.id);
    await db.delete(memberPayments).where(inArray(memberPayments.memberId, ids));
    await db.delete(groupMemberships).where(inArray(groupMemberships.memberId, ids));
    await db.delete(tenantMembers).where(inArray(tenantMembers.id, ids));
    console.log(`Removed ${ids.length} existing ${FIXTURE_TAG} member(s) and their payments.`);
  }

  if (reset) {
    console.log("Reset complete.");
    return;
  }

  if (emails.length === 0) {
    throw new Error(
      "Pass at least one --email=you@example.com so the fixtures have a real inbox to mail.",
    );
  }

  if (org.membershipManagementMode !== "periodic_renewal" || !org.membershipFeeEnabled) {
    console.warn(
      `! ${org.name} is not on periodic renewal with fees enabled (mode=${org.membershipManagementMode}, feeEnabled=${org.membershipFeeEnabled}).\n` +
        "  Payment rows are still seeded, but approval and the cron will not create new ones.\n" +
        "  Fix it in Settings → Membership.",
    );
  }

  const today = new Date();
  // Same resolver the generator uses, so fixtures land on the period key a
  // real run would have produced.
  const label = resolveMembershipPeriod({
    mode: org.membershipPeriodMode,
    renewalMonth: org.membershipRenewalMonth,
    renewalDay: org.membershipRenewalDay,
    today,
  }).label;

  // The first active group under a fee-managing category, if the org has one.
  const [feeGroup] = await db
    .select({ id: groups.id, name: groups.name, feeAmount: groups.feeAmount })
    .from(groups)
    .innerJoin(groupCategories, eq(groups.categoryId, groupCategories.id))
    .where(
      and(
        eq(groups.orgId, org.id),
        eq(groups.isActive, true),
        eq(groupCategories.managesMembershipFees, true),
      ),
    )
    .limit(1);

  const created: string[] = [];

  for (const [index, scenario] of SCENARIOS.entries()) {
    const email = emails[index % emails.length];
    const workspaceEmail =
      scenario.workspaceEmail && org.workspaceDomain
        ? `paytest.${scenario.key}@${org.workspaceDomain}`
        : null;

    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId: org.id,
        email,
        firstName: FIXTURE_TAG,
        lastName: scenario.lastName,
        role: "member",
        status: scenario.memberStatus,
        workspaceUserEmail: workspaceEmail,
        workspaceProvisionedAt: workspaceEmail ? new Date() : null,
      })
      .returning({ id: tenantMembers.id });

    if (scenario.payment?.useGroupFee && feeGroup) {
      await db.insert(groupMemberships).values({
        orgId: org.id,
        groupId: feeGroup.id,
        memberId: member.id,
        role: "member",
      });
    }

    if (scenario.payment) {
      const p = scenario.payment;
      const useGroup = Boolean(p.useGroupFee && feeGroup);

      await db.insert(memberPayments).values({
        orgId: org.id,
        memberId: member.id,
        type: "membership_fee",
        status: p.status,
        amount: useGroup ? feeGroup!.feeAmount ?? p.amount : p.amount,
        currency: org.membershipFeeCurrency,
        bankAccount: org.membershipFeeBankAccount,
        periodLabel: label,
        periodKey: useGroup ? `${label}:grp:${feeGroup!.id}` : `${label}:org:${org.id}`,
        variableSymbol: vs(index + 1),
        dueAt: daysFromNow(p.dueInDays),
        paidAt: p.paidInDays != null ? daysFromNow(p.paidInDays) : null,
        cancellationReason: p.cancellationReason ?? null,
        adminNote: p.adminNote ?? null,
      });
    }

    created.push(
      `  ${FIXTURE_TAG} ${scenario.lastName.padEnd(10)} ${email.padEnd(28)} ` +
        `member=${scenario.memberStatus.padEnd(9)} ` +
        `payment=${(scenario.payment?.status ?? "none").padEnd(9)} VS=${scenario.payment ? vs(index + 1) : "—"}\n` +
        `    ${scenario.note}`,
    );
  }

  console.log(`\nSeeded ${SCENARIOS.length} fixtures for ${org.name} (period ${label}):\n`);
  console.log(created.join("\n"));
  if (!feeGroup) {
    console.log(
      "\n! No active group under a fee-managing category — the group-override fixture used the org fee instead.",
    );
  }
  console.log("\nRemove them again with: pnpm tsx scripts/seed-payments-test.ts --reset");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
