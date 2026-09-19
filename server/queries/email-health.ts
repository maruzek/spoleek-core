import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { emailActivities } from "@/server/db/schema";
import type { ProviderAccount } from "@/server/notifications/send";
import { getMailer, isMailerConfigured } from "@/server/notifications/send";

export type EmailStatusCounts = Record<
  (typeof emailActivities.$inferSelect)["currentStatus"],
  number
>;

export type OrganizationEmailHealth = {
  /** Every outbound email Spoleek has recorded for this org. */
  allTime: EmailStatusCounts & { total: number };
  /** The same, limited to the last 30 days — the number worth acting on. */
  recent: EmailStatusCounts & { total: number };
  /** Share of recent emails that ended in bounce/complaint/failure/suppression. */
  recentProblemRate: number | null;
};

const EMPTY_COUNTS: EmailStatusCounts = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  failed: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function countByStatus(orgId: string, since: Date | null) {
  const rows = await db
    .select({
      status: emailActivities.currentStatus,
      count: count(),
    })
    .from(emailActivities)
    .where(
      and(
        eq(emailActivities.orgId, orgId),
        eq(emailActivities.direction, "outbound"),
        since ? gte(emailActivities.createdAt, since) : sql`true`,
      ),
    )
    .groupBy(emailActivities.currentStatus);

  const counts: EmailStatusCounts & { total: number } = { ...EMPTY_COUNTS, total: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

export async function getOrganizationEmailHealth(orgId: string): Promise<OrganizationEmailHealth> {
  const [allTime, recent] = await Promise.all([
    countByStatus(orgId, null),
    countByStatus(orgId, new Date(Date.now() - 30 * DAY_MS)),
  ]);

  const recentProblems = recent.bounced + recent.complained + recent.failed + recent.suppressed;

  return {
    allTime,
    recent,
    recentProblemRate: recent.total > 0 ? Math.round((recentProblems / recent.total) * 1000) / 10 : null,
  };
}

export type ProviderDomain = ProviderAccount["domains"][number];

export type ProviderEmailHealth =
  | { configured: false }
  | { configured: true; error: string }
  | {
      configured: true;
      error: null;
      domains: ProviderDomain[];
      webhooks: { id: string; endpoint: string; status: string; events: string[] }[];
      /** Last event on each of the most recent emails across the whole Resend account. */
      recentByLastEvent: Record<string, number>;
      recentSample: number;
    };

/**
 * What Resend itself says about the account. This is account-wide, not
 * per-tenant — every org sends through the same key — so callers must only
 * show it to system admins.
 */
export async function getProviderEmailHealth(): Promise<ProviderEmailHealth> {
  if (!isMailerConfigured()) {
    return { configured: false };
  }

  try {
    const account = await getMailer().inspectAccount();

    const recentByLastEvent: Record<string, number> = {};
    for (const email of account.recentEmails) {
      recentByLastEvent[email.lastEvent] = (recentByLastEvent[email.lastEvent] ?? 0) + 1;
    }

    return {
      configured: true,
      error: null,
      domains: account.domains,
      webhooks: account.webhooks,
      recentByLastEvent,
      recentSample: account.recentEmails.length,
    };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Resend did not answer.",
    };
  }
}
