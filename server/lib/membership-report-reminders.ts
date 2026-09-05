import { and, eq } from "drizzle-orm";

import { getServerEnv } from "@/lib/env";
import { PERIOD_DATE_TIMEZONE } from "@/lib/membership-period";
import { daysUntil } from "@/lib/membership-report-status";
import { MembershipReportDigestEmail } from "@/emails/membership-report-digest-email";
import { MembershipReportReminderEmail } from "@/emails/membership-report-reminder-email";
import { db } from "@/server/db";
import {
  groups,
  membershipReportGroups,
  membershipReports,
  organizations,
  type MembershipReportReminderStage,
} from "@/server/db/schema";
import { getFeeManagingCategory } from "@/server/lib/membership-report";
import {
  resolveBoardRecipients,
  resolveReportReminderRecipients,
} from "@/server/notifications/recipients";
import { sendNotificationEmails } from "@/server/notifications/send";

/**
 * The reminder ladder, in ascending urgency.
 *
 * Fixed rather than configurable. `daysBefore` is the point at which a rung
 * becomes due; `overdue` has none because it is driven by repetition instead.
 */
const LADDER: Array<{
  stage: MembershipReportReminderStage;
  daysBefore: number;
}> = [
  { stage: "t_minus_14", daysBefore: 14 },
  { stage: "t_minus_7", daysBefore: 7 },
  { stage: "t_minus_1", daysBefore: 1 },
];

const STAGE_RANK: Record<MembershipReportReminderStage, number> = {
  t_minus_14: 0,
  t_minus_7: 1,
  t_minus_1: 2,
  overdue: 3,
};

/** How often the overdue nudge repeats once the deadline has passed. */
const OVERDUE_REPEAT_DAYS = 7;

/**
 * Which rung is due today, or null when nothing is.
 *
 * Rungs are caught up rather than skipped: a group that first becomes eligible
 * at 9 days out still gets the 14-day rung, because the point is that they have
 * been told once, not that they were told on an exact date. Overdue repeats on
 * a cadence, so it is the one rung that can fire against itself.
 */
function getDueStage(params: {
  daysLeft: number;
  lastStage: MembershipReportReminderStage | null;
  lastSentAt: Date | null;
  now: Date;
}): MembershipReportReminderStage | null {
  const { daysLeft, lastStage, lastSentAt, now } = params;

  if (daysLeft < 0) {
    if (lastStage !== "overdue") return "overdue";
    if (!lastSentAt) return "overdue";

    const daysSinceLast = Math.floor(
      (now.getTime() - lastSentAt.getTime()) / 86_400_000,
    );
    return daysSinceLast >= OVERDUE_REPEAT_DAYS ? "overdue" : null;
  }

  const lastRank = lastStage ? STAGE_RANK[lastStage] : -1;

  // The most urgent rung whose threshold has been reached and which has not
  // been sent yet.
  for (const rung of [...LADDER].reverse()) {
    if (daysLeft <= rung.daysBefore && STAGE_RANK[rung.stage] > lastRank) {
      return rung.stage;
    }
  }

  return null;
}

function formatDeadline(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PERIOD_DATE_TIMEZONE,
  }).format(new Date(value));
}

export type ReportReminderResult = {
  orgsProcessed: number;
  groupsReminded: number;
  digestsSent: number;
  errors: Array<{ orgId: string; error: string }>;
};

/**
 * Sends confirmation reminders for every organization with an open report.
 *
 * Runs from the daily membership payments cron rather than its own schedule —
 * same cadence, and one fewer cron entry to keep in sync.
 */
export async function sendMembershipReportReminders(
  today: Date = new Date(),
): Promise<ReportReminderResult> {
  const result: ReportReminderResult = {
    orgsProcessed: 0,
    groupsReminded: 0,
    digestsSent: 0,
    errors: [],
  };

  const orgs = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.membershipReportEnabled, true),
        eq(organizations.emailNotifyReportReminder, true),
      ),
    );

  for (const org of orgs) {
    try {
      result.orgsProcessed += 1;
      const orgResult = await remindOrganization(org, today);
      result.groupsReminded += orgResult.groupsReminded;
      result.digestsSent += orgResult.digestsSent;
    } catch (error) {
      result.errors.push({
        orgId: org.id,
        error: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }

  return result;
}

async function remindOrganization(
  org: typeof organizations.$inferSelect,
  today: Date,
): Promise<{ groupsReminded: number; digestsSent: number }> {
  const [report] = await db
    .select()
    .from(membershipReports)
    .where(
      and(
        eq(membershipReports.orgId, org.id),
        eq(membershipReports.status, "open"),
      ),
    )
    .limit(1);

  // No open report, or no deadline to count down to.
  if (!report?.confirmDueAt) return { groupsReminded: 0, digestsSent: 0 };

  const category = await getFeeManagingCategory(org.id);
  if (!category) return { groupsReminded: 0, digestsSent: 0 };

  const daysLeft = daysUntil(report.confirmDueAt, today);

  // Nothing to say until the first rung is in range.
  if (daysLeft > LADDER[0].daysBefore) {
    return { groupsReminded: 0, digestsSent: 0 };
  }

  const appUrl = getServerEnv().APP_URL.replace(/\/$/, "");
  const deadline = formatDeadline(report.confirmDueAt, org.locale);

  const rows = await db
    .select({
      id: membershipReportGroups.id,
      groupId: membershipReportGroups.groupId,
      groupName: membershipReportGroups.groupName,
      status: membershipReportGroups.status,
      memberCount: membershipReportGroups.memberCount,
      paidCount: membershipReportGroups.paidCount,
      waivedCount: membershipReportGroups.waivedCount,
      reminderStageSent: membershipReportGroups.reminderStageSent,
      reminderSentAt: membershipReportGroups.reminderSentAt,
      categoryId: groups.categoryId,
    })
    .from(membershipReportGroups)
    .leftJoin(groups, eq(membershipReportGroups.groupId, groups.id))
    .where(eq(membershipReportGroups.reportId, report.id));

  // A submitted or approved group has done its part. `returned` is chased
  // again, because the board is waiting on it.
  // A row whose group was deleted has nobody to chase and nowhere to send
  // them; it is history, not outstanding work.
  const outstanding = rows.filter(
    (row): row is typeof row & { groupId: string; categoryId: string } =>
      row.groupId !== null &&
      row.categoryId !== null &&
      (row.status === "not_started" ||
        row.status === "in_progress" ||
        row.status === "returned"),
  );

  let groupsReminded = 0;

  for (const row of outstanding) {
    const stage = getDueStage({
      daysLeft,
      lastStage: row.reminderStageSent,
      lastSentAt: row.reminderSentAt,
      now: today,
    });

    if (!stage) continue;

    const { recipients, fellBackToOrgAdmins } =
      await resolveReportReminderRecipients({
        orgId: org.id,
        groupId: row.groupId,
        categoryId: row.categoryId,
      });

    if (recipients.length === 0) continue;

    const subject = fellBackToOrgAdmins
      ? `${row.groupName} has nobody to confirm its ${report.periodLabel} members`
      : daysLeft < 0
        ? `Overdue: confirm ${row.groupName}'s ${report.periodLabel} members`
        : `${row.groupName}: confirm your ${report.periodLabel} members by ${deadline}`;

    await sendNotificationEmails({
      orgId: org.id,
      kind: "report_reminder",
      recipients,
      subject,
      react: MembershipReportReminderEmail({
        organizationName: org.name,
        groupName: row.groupName,
        periodLabel: report.periodLabel,
        deadline,
        daysLeft,
        memberCount: row.memberCount,
        paidCount: row.paidCount,
        waivedCount: row.waivedCount,
        reportUrl: `${appUrl}/admin/groups/${row.categoryId}/${row.groupId}`,
        toBoardFallback: fellBackToOrgAdmins,
      }),
      metadata: {
        reportId: report.id,
        reportGroupId: row.id,
        periodLabel: report.periodLabel,
        stage,
        daysLeft,
      },
    });

    // Recorded after the send, so a crash mid-batch re-sends rather than
    // silently skipping — a duplicate reminder is a far smaller failure than a
    // deadline nobody was told about.
    await db
      .update(membershipReportGroups)
      .set({
        reminderStageSent: stage,
        reminderSentAt: today,
        updatedAt: new Date(),
      })
      .where(eq(membershipReportGroups.id, row.id));

    groupsReminded += 1;
  }

  const digestsSent = await sendBoardDigest({
    org,
    report,
    rows,
    daysLeft,
    deadline,
    appUrl,
    remindedThisRun: groupsReminded,
    now: today,
  });

  return { groupsReminded, digestsSent };
}

/**
 * The board's chasing list.
 *
 * Sent on the last rung and then on the overdue cadence — early rungs are the
 * groups' business, and a digest at 14 days out is noise the board learns to
 * ignore. Timing piggybacks on the group rows' ladder state so the digest does
 * not need a repetition record of its own.
 */
async function sendBoardDigest(params: {
  org: typeof organizations.$inferSelect;
  report: typeof membershipReports.$inferSelect;
  rows: Array<{
    groupId: string | null;
    groupName: string;
    status: string;
    memberCount: number;
  }>;
  daysLeft: number;
  deadline: string;
  appUrl: string;
  /** How many groups were mailed in this same run. */
  remindedThisRun: number;
  now: Date;
}): Promise<number> {
  const { org, report, rows, daysLeft, deadline, appUrl } = params;

  if (daysLeft > 1) return 0;

  // A deleted group's row can never be completed, so naming it here would tell
  // the board to chase something that no longer exists.
  const outstandingGroups = rows
    .filter(
      (row) =>
        row.groupId !== null &&
        (row.status === "not_started" ||
        row.status === "in_progress" ||
        row.status === "returned"),
    )
    .map((row) => row.groupName);

  const awaitingApprovalGroups = rows
    .filter((row) => row.status === "submitted")
    .map((row) => row.groupName);

  // Nothing for the board to do.
  if (outstandingGroups.length === 0 && awaitingApprovalGroups.length === 0) {
    return 0;
  }

  // Rides the group reminders' cadence rather than keeping a repetition record
  // of its own. Taken from this run's own count, not from the rows — those were
  // read before the ladder was advanced and would always look like yesterday.
  //
  // The exception is when nothing is outstanding: every group has submitted and
  // the board is the only one still holding something, so there are no group
  // reminders to ride and the digest goes out on its own.
  if (params.remindedThisRun === 0) {
    // Nothing outstanding means there are no group reminders to ride, so the
    // digest paces itself on the overdue cadence instead of sending daily.
    if (outstandingGroups.length > 0) return 0;

    const lastSent = params.report.digestSentAt;
    const daysSinceDigest = lastSent
      ? Math.floor((params.now.getTime() - lastSent.getTime()) / 86_400_000)
      : null;

    if (daysSinceDigest !== null && daysSinceDigest < OVERDUE_REPEAT_DAYS) {
      return 0;
    }
  }

  const recipients = await resolveBoardRecipients(org.id);
  if (recipients.length === 0) return 0;

  const submittedCount = rows.filter(
    (row) => row.status === "submitted" || row.status === "approved",
  ).length;

  await sendNotificationEmails({
    orgId: org.id,
    kind: "report_digest",
    recipients,
    subject:
      outstandingGroups.length > 0
        ? `${outstandingGroups.length} group${
            outstandingGroups.length === 1 ? "" : "s"
          } still to submit the ${report.periodLabel} report`
        : `${awaitingApprovalGroups.length} ${report.periodLabel} report${
            awaitingApprovalGroups.length === 1 ? "" : "s"
          } waiting for approval`,
    react: MembershipReportDigestEmail({
      organizationName: org.name,
      periodLabel: report.periodLabel,
      deadline,
      daysLeft,
      groupCount: rows.length,
      submittedCount,
      approvedCount: rows.filter((row) => row.status === "approved").length,
      memberCount: rows.reduce((sum, row) => sum + row.memberCount, 0),
      outstandingGroups,
      awaitingApprovalGroups,
      reportUrl: `${appUrl}/admin/reports`,
    }),
    metadata: {
      reportId: report.id,
      periodLabel: report.periodLabel,
      daysLeft,
      outstanding: outstandingGroups.length,
    },
  });

  await db
    .update(membershipReports)
    .set({ digestSentAt: params.now, updatedAt: new Date() })
    .where(eq(membershipReports.id, report.id));

  return 1;
}
