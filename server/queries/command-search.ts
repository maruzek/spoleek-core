import { and, asc, count, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/server/db";
import {
  events,
  groupCategories,
  groups,
  membershipReports,
  policyDocuments,
  tenantMembers,
} from "@/server/db/schema";
import { matchesAllWordsSql } from "@/server/lib/search-sql";

export const COMMAND_SEARCH_GROUP_LIMIT = 5;

export type CommandSearchEntity =
  | "members"
  | "groups"
  | "categories"
  | "events"
  | "reports"
  | "policies";

export type CommandSearchHit = {
  id: string;
  /** Primary line. */
  title: string;
  /** Secondary line: email, category name, status… */
  subtitle: string | null;
  /** ISO timestamp the client formats in the viewer's locale (events). */
  date?: string | null;
  href: string;
};

export type CommandSearchGroup = {
  entity: CommandSearchEntity;
  total: number;
  hits: CommandSearchHit[];
  /** Where "See all N results" leads. */
  seeAllHref: string;
};

export type CommandSearchResult = {
  query: string;
  groups: CommandSearchGroup[];
};

/**
 * One capped, counted query per entity. Every table is filtered by `orgId`
 * first and the text condition is `and`-ed on top, so a query that matches
 * nothing still never leaks across tenants.
 *
 * TODO(forms): add a `forms` group here once the forms schema and
 * `/admin/forms/[id]` route exist. The shape is the same as every other group.
 */
export async function searchCommandPalette(
  orgId: string,
  query: string,
): Promise<CommandSearchResult> {
  const limit = COMMAND_SEARCH_GROUP_LIMIT;

  const memberWhere = and(
    eq(tenantMembers.orgId, orgId),
    ne(tenantMembers.status, "deleted"),
    matchesAllWordsSql(
      sql`concat_ws(' ', ${tenantMembers.firstName}, ${tenantMembers.lastName}, ${tenantMembers.email})`,
      query,
    ),
  );
  const groupWhere = and(
    eq(groups.orgId, orgId),
    matchesAllWordsSql(sql`${groups.name}`, query),
  );
  const categoryWhere = and(
    eq(groupCategories.orgId, orgId),
    matchesAllWordsSql(sql`${groupCategories.name}`, query),
  );
  const eventWhere = and(
    eq(events.orgId, orgId),
    isNull(events.deletedAt),
    matchesAllWordsSql(sql`${events.title}`, query),
  );
  const reportWhere = and(
    eq(membershipReports.orgId, orgId),
    matchesAllWordsSql(sql`${membershipReports.periodLabel}`, query),
  );
  const policyWhere = and(
    eq(policyDocuments.orgId, orgId),
    matchesAllWordsSql(sql`${policyDocuments.title}`, query),
  );

  const [
    memberRows,
    [memberCount],
    groupRows,
    [groupCount],
    categoryRows,
    [categoryCount],
    eventRows,
    [eventCount],
    reportRows,
    [reportCount],
    policyRows,
    [policyCount],
  ] = await Promise.all([
    db
      .select({
        id: tenantMembers.id,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        status: tenantMembers.status,
      })
      .from(tenantMembers)
      .where(memberWhere)
      .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName))
      .limit(limit),
    countOf(tenantMembers, memberWhere),
    db
      .select({
        id: groups.id,
        name: groups.name,
        categoryId: groups.categoryId,
        categoryName: groupCategories.name,
      })
      .from(groups)
      .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
      .where(groupWhere)
      .orderBy(asc(groups.name))
      .limit(limit),
    countOf(groups, groupWhere),
    db
      .select({ id: groupCategories.id, name: groupCategories.name })
      .from(groupCategories)
      .where(categoryWhere)
      .orderBy(asc(groupCategories.name))
      .limit(limit),
    countOf(groupCategories, categoryWhere),
    db
      .select({
        id: events.id,
        title: events.title,
        startsAt: events.startsAt,
        status: events.status,
      })
      .from(events)
      .where(eventWhere)
      .orderBy(desc(events.startsAt))
      .limit(limit),
    countOf(events, eventWhere),
    db
      .select({
        id: membershipReports.id,
        periodLabel: membershipReports.periodLabel,
        status: membershipReports.status,
      })
      .from(membershipReports)
      .where(reportWhere)
      .orderBy(desc(membershipReports.periodStart))
      .limit(limit),
    countOf(membershipReports, reportWhere),
    db
      .select({ id: policyDocuments.id, title: policyDocuments.title })
      .from(policyDocuments)
      .where(policyWhere)
      .orderBy(asc(policyDocuments.sortOrder), asc(policyDocuments.title))
      .limit(limit),
    countOf(policyDocuments, policyWhere),
  ]);

  const searchParam = encodeURIComponent(query);

  const result: CommandSearchGroup[] = [
    {
      entity: "members",
      total: memberCount.total,
      seeAllHref: `/admin/members?q=${searchParam}`,
      hits: memberRows.map((row) => ({
        id: row.id,
        title: `${row.firstName} ${row.lastName}`.trim() || row.email || row.id,
        subtitle: row.email,
        href: `/admin/members/${row.id}`,
      })),
    },
    {
      entity: "groups",
      total: groupCount.total,
      seeAllHref: "/admin/groups",
      hits: groupRows.map((row) => ({
        id: row.id,
        title: row.name,
        subtitle: row.categoryName,
        href: `/admin/groups/${row.categoryId}`,
      })),
    },
    {
      entity: "categories",
      total: categoryCount.total,
      seeAllHref: "/admin/groups",
      hits: categoryRows.map((row) => ({
        id: row.id,
        title: row.name,
        subtitle: null,
        href: `/admin/groups/${row.id}`,
      })),
    },
    {
      entity: "events",
      total: eventCount.total,
      seeAllHref: "/admin/events",
      hits: eventRows.map((row) => ({
        id: row.id,
        title: row.title,
        subtitle: row.status,
        date: row.startsAt?.toISOString() ?? null,
        href: `/admin/events/${row.id}`,
      })),
    },
    {
      entity: "reports",
      total: reportCount.total,
      seeAllHref: "/admin/reports",
      hits: reportRows.map((row) => ({
        id: row.id,
        title: row.periodLabel,
        subtitle: row.status,
        href: `/admin/reports?report=${row.id}`,
      })),
    },
    {
      entity: "policies",
      total: policyCount.total,
      seeAllHref: "/admin/settings?tab=legal",
      hits: policyRows.map((row) => ({
        id: row.id,
        title: row.title,
        subtitle: null,
        href: "/admin/settings?tab=legal",
      })),
    },
  ];

  return { query, groups: result.filter((group) => group.total > 0) };
}

function countOf(table: PgTable, where: SQL | undefined) {
  return db.select({ total: count() }).from(table).where(where);
}
