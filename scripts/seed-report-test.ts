/**
 * Fixture seeder for manual testing of the yearly member report.
 *
 * Builds five regions under the fee-managing category, each with a real group
 * admin and a roster of paid members, then drives them to a different report
 * status so the board dashboard has something to sort, filter and act on.
 *
 * Usage:
 *   pnpm db:seed:report --email=you@example.com
 *   pnpm db:seed:report --email=a@x.cz --email=b@y.cz   # rotated across admins
 *   pnpm db:seed:report --reset                          # remove fixtures
 *
 * Groups are tagged by the slug prefix "reptest-" and members by the first name
 * "RepTest"; --reset removes exactly those and nothing else. Ordinary members
 * get addresses on the reserved .invalid TLD so a stray send cannot reach a
 * real inbox — only the group admins, who receive the reminders, use the
 * addresses you pass in.
 */
import { and, eq, inArray, like } from "drizzle-orm";

import { resolveMembershipPeriod } from "@/lib/membership-period";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  membershipReportGroups,
  membershipReportMembers,
  organizations,
  tenantMembers,
  type MembershipReportGroupStatus,
} from "@/server/db/schema";
import {
  openMembershipReport,
  recalculateReportGroupCounts,
  syncReportMemberForPayment,
} from "@/server/lib/membership-report";

const MEMBER_TAG = "RepTest";
const GROUP_SLUG_PREFIX = "reptest-";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const emails = args
  .filter((a) => a.startsWith("--email="))
  .map((a) => a.slice("--email=".length).trim().toLowerCase())
  .filter(Boolean);

type RegionFixture = {
  name: string;
  slug: string;
  /** Surnames of the members who confirmed. */
  members: string[];
  /** How many of them are waived rather than paid. */
  waived: number;
  targetStatus: MembershipReportGroupStatus;
  /** Adds a member who paid after the roster was locked. */
  lateAddition?: boolean;
  note: string;
};

const REGIONS: RegionFixture[] = [
  {
    name: "Brno",
    slug: `${GROUP_SLUG_PREFIX}brno`,
    members: ["Dvořák", "Nováková", "Svoboda", "Černý", "Procházka"],
    waived: 0,
    targetStatus: "not_started",
    note: "Nothing done yet — the reminder ladder should chase this one.",
  },
  {
    name: "Ostrava",
    slug: `${GROUP_SLUG_PREFIX}ostrava`,
    members: ["Kučera", "Veselá", "Horák", "Marek"],
    waived: 1,
    targetStatus: "in_progress",
    note: "Started but not submitted; one member is waived, one left out with a reason.",
  },
  {
    name: "Plzeň",
    slug: `${GROUP_SLUG_PREFIX}plzen`,
    members: ["Němec", "Pokorná", "Urban", "Beneš", "Fiala", "Sedláčková"],
    waived: 0,
    targetStatus: "submitted",
    lateAddition: true,
    note: "Waiting for the board, with a late payer queued as a pending addition.",
  },
  {
    name: "Liberec",
    slug: `${GROUP_SLUG_PREFIX}liberec`,
    members: ["Malý", "Kratochvílová", "Doležal"],
    waived: 1,
    targetStatus: "approved",
    note: "Already approved — should sort to the bottom of the board table.",
  },
  {
    name: "Olomouc",
    slug: `${GROUP_SLUG_PREFIX}olomouc`,
    members: ["Šimek", "Bartošová", "Růžička", "Konečný"],
    waived: 0,
    targetStatus: "returned",
    note: "Sent back by the board — should sort to the very top.",
  },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function removeFixtures(orgId: string) {
  const members = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.firstName, MEMBER_TAG)));

  if (members.length > 0) {
    const ids = members.map((m) => m.id);
    // Report rows reference payments and members; clear them first so the
    // ON DELETE SET NULL columns do not leave orphaned names behind.
    await db
      .delete(membershipReportMembers)
      .where(inArray(membershipReportMembers.memberId, ids));
    await db.delete(memberPayments).where(inArray(memberPayments.memberId, ids));
    await db.delete(groupMemberships).where(inArray(groupMemberships.memberId, ids));
    await db.delete(tenantMembers).where(inArray(tenantMembers.id, ids));
  }

  const fixtureGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), like(groups.slug, `${GROUP_SLUG_PREFIX}%`)));

  if (fixtureGroups.length > 0) {
    const ids = fixtureGroups.map((g) => g.id);
    await db
      .delete(membershipReportGroups)
      .where(inArray(membershipReportGroups.groupId, ids));
    await db.delete(groups).where(inArray(groups.id, ids));
  }

  return { members: members.length, groups: fixtureGroups.length };
}

async function main() {
  const [org] = await db.select().from(organizations).limit(1);

  if (!org) {
    throw new Error("No organization found. Run pnpm db:seed or the setup wizard first.");
  }

  const removed = await removeFixtures(org.id);
  if (removed.members || removed.groups) {
    console.log(
      `Removed ${removed.members} ${MEMBER_TAG} member(s) and ${removed.groups} fixture group(s).`,
    );
  }

  if (reset) {
    console.log("Reset complete.");
    return;
  }

  if (emails.length === 0) {
    throw new Error(
      "Pass at least one --email=you@example.com — the group admins need a real inbox for the reminders.",
    );
  }

  if (!org.membershipReportEnabled) {
    throw new Error(
      "The yearly member report is off. Turn it on in Settings → Membership first.",
    );
  }

  const [category] = await db
    .select({ id: groupCategories.id, name: groupCategories.name })
    .from(groupCategories)
    .where(
      and(
        eq(groupCategories.orgId, org.id),
        eq(groupCategories.isActive, true),
        eq(groupCategories.managesMembershipFees, true),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error(
      "No active group category manages membership fees, so there is nothing to report on.",
    );
  }

  const label = resolveMembershipPeriod({
    mode: org.membershipPeriodMode,
    renewalMonth: org.membershipRenewalMonth,
    renewalDay: org.membershipRenewalDay,
    today: new Date(),
  }).label;

  const feeAmount = org.membershipFeeAmount ?? 10000;
  let vsSeed = 700000;

  const createdGroups: Array<{
    fixture: RegionFixture;
    groupId: string;
    adminEmail: string;
    lateMemberId: string | null;
    latePaymentId: string | null;
  }> = [];

  for (const [index, fixture] of REGIONS.entries()) {
    const [group] = await db
      .insert(groups)
      .values({
        orgId: org.id,
        categoryId: category.id,
        name: fixture.name,
        slug: fixture.slug,
        description: `Test region for the yearly report (${fixture.targetStatus}).`,
        joinPolicy: "admin_only",
        isActive: true,
        sortOrder: 10 + index,
      })
      .returning({ id: groups.id });

    // The group admin gets a real address: they are who the reminders go to.
    const adminEmail = emails[index % emails.length];
    const [admin] = await db
      .insert(tenantMembers)
      .values({
        orgId: org.id,
        email: adminEmail,
        firstName: MEMBER_TAG,
        lastName: `Admin ${fixture.name}`,
        role: "member",
        status: "active",
        acceptedTermsAt: new Date(),
        acceptedPrivacyAt: new Date(),
      })
      .returning({ id: tenantMembers.id });

    await db.insert(groupMemberships).values({
      orgId: org.id,
      groupId: group.id,
      memberId: admin.id,
      role: "group_admin",
    });

    for (const [memberIndex, lastName] of fixture.members.entries()) {
      const isWaived = memberIndex < fixture.waived;

      const [member] = await db
        .insert(tenantMembers)
        .values({
          orgId: org.id,
          // Reserved TLD: guaranteed never to resolve, so a stray send cannot
          // reach anyone real.
          email: `reptest.${fixture.slug}.${memberIndex}@example.invalid`,
          firstName: MEMBER_TAG,
          lastName,
          role: "member",
          status: "active",
          acceptedTermsAt: new Date(),
          acceptedPrivacyAt: new Date(),
        })
        .returning({ id: tenantMembers.id });

      await db.insert(groupMemberships).values({
        orgId: org.id,
        groupId: group.id,
        memberId: member.id,
        role: "member",
      });

      vsSeed += 1;
      await db.insert(memberPayments).values({
        orgId: org.id,
        memberId: member.id,
        type: "membership_fee",
        status: isWaived ? "cancelled" : "paid",
        amount: feeAmount,
        currency: org.membershipFeeCurrency,
        bankAccount: org.membershipFeeBankAccount,
        periodLabel: label,
        periodKey: `${label}:org:${org.id}`,
        variableSymbol: String(vsSeed),
        dueAt: daysAgo(60),
        paidAt: isWaived ? null : daysAgo(45),
        cancellationReason: isWaived ? "waived" : null,
        adminNote: isWaived ? "Honorary member — fee waived." : null,
      });
    }

    createdGroups.push({
      fixture,
      groupId: group.id,
      adminEmail,
      lateMemberId: null,
      latePaymentId: null,
    });
  }

  // Opens the report and backfills every confirmed member above. Groups all
  // start at not_started, exactly as a real open would leave them.
  const opened = await openMembershipReport({
    orgId: org.id,
    userId: (await db.select({ id: tenantMembers.userId }).from(tenantMembers).where(
      and(eq(tenantMembers.orgId, org.id), eq(tenantMembers.role, "org_admin")),
    ).limit(1))[0]?.id ?? "",
  });

  console.log(
    `\nOpened report ${opened.periodLabel}: ${opened.groupsCreated} group(s), ${opened.membersBackfilled} member(s) backfilled.`,
  );

  const [orgAdmin] = await db
    .select({ id: tenantMembers.id, userId: tenantMembers.userId })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, org.id), eq(tenantMembers.role, "org_admin")))
    .limit(1);

  for (const entry of createdGroups) {
    const [reportGroup] = await db
      .select({ id: membershipReportGroups.id })
      .from(membershipReportGroups)
      .where(
        and(
          eq(membershipReportGroups.reportId, opened.reportId),
          eq(membershipReportGroups.groupId, entry.groupId),
        ),
      )
      .limit(1);

    if (!reportGroup) continue;

    const [groupAdmin] = await db
      .select({ id: tenantMembers.id })
      .from(groupMemberships)
      .innerJoin(tenantMembers, eq(groupMemberships.memberId, tenantMembers.id))
      .where(
        and(
          eq(groupMemberships.groupId, entry.groupId),
          eq(groupMemberships.role, "group_admin"),
        ),
      )
      .limit(1);

    const status = entry.fixture.targetStatus;

    // Ostrava demonstrates the exclusion path: one confirmed member left out
    // with a written reason, which is what the board sees on the row.
    if (status === "in_progress") {
      const [excluded] = await db
        .select({ id: membershipReportMembers.id })
        .from(membershipReportMembers)
        .where(eq(membershipReportMembers.reportGroupId, reportGroup.id))
        .limit(1);

      if (excluded) {
        await db
          .update(membershipReportMembers)
          .set({
            included: false,
            note: "Moved away in February — confirmed by phone.",
          })
          .where(eq(membershipReportMembers.id, excluded.id));
      }

      await db
        .update(membershipReportGroups)
        .set({
          status: "in_progress",
          reminderStageSent: "t_minus_14",
          reminderSentAt: daysAgo(10),
        })
        .where(eq(membershipReportGroups.id, reportGroup.id));
    }

    if (status === "submitted" || status === "approved" || status === "returned") {
      await db
        .update(membershipReportGroups)
        .set({
          status: "submitted",
          submittedAt: daysAgo(6),
          submittedByMemberId: groupAdmin?.id ?? null,
          submissionNote:
            status === "returned"
              ? "Everyone confirmed."
              : "Checked against our own list, all correct.",
          reminderStageSent: "t_minus_7",
          reminderSentAt: daysAgo(8),
        })
        .where(eq(membershipReportGroups.id, reportGroup.id));
    }

    if (status === "approved") {
      await db
        .update(membershipReportGroups)
        .set({
          status: "approved",
          approvedAt: daysAgo(3),
          approvedByUserId: orgAdmin?.userId ?? null,
          selfApproved: false,
        })
        .where(eq(membershipReportGroups.id, reportGroup.id));
    }

    if (status === "returned") {
      await db
        .update(membershipReportGroups)
        .set({
          status: "returned",
          returnedAt: daysAgo(2),
          returnedReason:
            "Two names are missing compared with last year — please check and resubmit.",
          approvedAt: null,
          approvedByUserId: null,
          selfApproved: false,
          // A group owed the chase again gets the ladder back.
          reminderStageSent: null,
          reminderSentAt: null,
        })
        .where(eq(membershipReportGroups.id, reportGroup.id));
    }

    // Recomputed through the real path — never left to raw SQL, which is how
    // the cached counts drifted out of step with the roster once before.
    await recalculateReportGroupCounts(reportGroup.id);

    // The late payer lands after the roster is locked, so it queues as a
    // pending addition rather than joining the counts.
    if (entry.fixture.lateAddition) {
      const [lateMember] = await db
        .insert(tenantMembers)
        .values({
          orgId: org.id,
          email: `reptest.${entry.fixture.slug}.late@example.invalid`,
          firstName: MEMBER_TAG,
          lastName: "Opožděný",
          role: "member",
          status: "active",
          acceptedTermsAt: new Date(),
          acceptedPrivacyAt: new Date(),
        })
        .returning({ id: tenantMembers.id });

      await db.insert(groupMemberships).values({
        orgId: org.id,
        groupId: entry.groupId,
        memberId: lateMember.id,
        role: "member",
      });

      vsSeed += 1;
      const [latePayment] = await db
        .insert(memberPayments)
        .values({
          orgId: org.id,
          memberId: lateMember.id,
          type: "membership_fee",
          status: "paid",
          amount: feeAmount,
          currency: org.membershipFeeCurrency,
          bankAccount: org.membershipFeeBankAccount,
          periodLabel: label,
          periodKey: `${label}:org:${org.id}`,
          variableSymbol: String(vsSeed),
          dueAt: daysAgo(60),
          paidAt: daysAgo(1),
        })
        .returning({ id: memberPayments.id });

      await syncReportMemberForPayment(latePayment.id);
    }
  }

  const summary = await db
    .select({
      name: membershipReportGroups.groupName,
      status: membershipReportGroups.status,
      members: membershipReportGroups.memberCount,
      paid: membershipReportGroups.paidCount,
      waived: membershipReportGroups.waivedCount,
      total: membershipReportGroups.feeTotalCents,
    })
    .from(membershipReportGroups)
    .where(eq(membershipReportGroups.reportId, opened.reportId));

  console.log(`\nRegions in ${category.name}:\n`);
  console.table(summary);

  console.log("Group admins (these receive the reminder emails):");
  for (const entry of createdGroups) {
    console.log(
      `  ${entry.fixture.name.padEnd(9)} ${entry.adminEmail.padEnd(28)} ${entry.fixture.note}`,
    );
  }

  console.log(
    "\nRemove them again with: pnpm db:seed:report --reset",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
