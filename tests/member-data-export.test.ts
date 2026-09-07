import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberCustomFieldValues,
  memberCustomFields,
  memberInvites,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { buildMemberDataExport } from "@/server/lib/member-data-export";

/**
 * An access request answered inconsistently is worse evidence than one answered
 * late, which is why the export is code rather than a runbook.
 */

/**
 * The failure mode this guards is silent: someone adds a table with a
 * `member_id` and the export quietly stops being complete, with nothing to
 * notice it. Reading the schema back is the only check that keeps working
 * without anybody remembering to update it.
 */
describe("export coverage", () => {
  it("accounts for every table that stores a member id", () => {
    const schema = readFileSync("server/db/schema.ts", "utf8");
    const collector = readFileSync("server/lib/member-data-export.ts", "utf8");

    // Table name is the pgTable literal preceding each member_id column.
    const tables = new Set<string>();
    const tablePattern = /pgTable\(\s*"([a-z_]+)"/g;
    const positions: { name: string; index: number }[] = [];

    for (const match of schema.matchAll(tablePattern)) {
      positions.push({ name: match[1]!, index: match.index! });
    }

    for (const match of schema.matchAll(/"(member_id|submitted_by_member_id)"/g)) {
      const owner = [...positions].reverse().find((t) => t.index < match.index!);
      if (owner) tables.add(owner.name);
    }

    expect(tables.size).toBeGreaterThan(0);

    // Some tables are read through a shared query helper rather than named
    // directly, so the check accepts that identifier as evidence instead.
    const coveredIndirectly = new Map<string, string>([
      ["member_policy_acknowledgements", "listMemberAcknowledgements"],
    ]);

    const missing = [...tables].filter((table) => {
      const alias = coveredIndirectly.get(table);
      if (alias) return !collector.includes(alias);

      const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      return !collector.includes(camel);
    });

    expect(missing).toEqual([]);
  });
});

const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("the member data export", () => {
  let orgId: string;
  let memberId: string;

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `export-test-${Date.now()}`,
        name: "Export test org",
        legalName: "Export Test Organization z.s.",
        primaryEmail: "board@example.test",
      })
      .returning({ id: organizations.id });

    orgId = organization.id;

    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName: "Eva",
        lastName: "Nováková",
        email: "eva@example.test",
        status: "active",
      })
      .returning({ id: tenantMembers.id });

    memberId = member.id;

    const [category] = await db
      .insert(groupCategories)
      .values({ orgId, name: "Regions", slug: "regions" })
      .returning({ id: groupCategories.id });

    const [group] = await db
      .insert(groups)
      .values({ orgId, categoryId: category.id, name: "Brno", slug: "brno" })
      .returning({ id: groups.id });

    const [field] = await db
      .insert(memberCustomFields)
      .values({
        orgId,
        key: "phone",
        label: "Phone number",
        type: "phone",
        stage: "registration",
      })
      .returning({ id: memberCustomFields.id });

    await Promise.all([
      db.insert(groupMemberships).values({ orgId, groupId: group.id, memberId }),
      db
        .insert(memberCustomFieldValues)
        .values({ orgId, memberId, fieldId: field.id, value: "+420123456789" }),
      db.insert(memberPayments).values({
        orgId,
        memberId,
        amount: 20000,
        currency: "CZK",
        periodLabel: "2026",
        periodKey: "2026",
        dueAt: new Date("2026-03-31T00:00:00Z"),
      }),
      db.insert(memberInvites).values({
        orgId,
        memberId,
        status: "sent",
        tokenHash: "a-secret-token-hash-that-must-not-leak",
      }),
    ]);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await pool.end();
  });

  it("returns null for a member outside the organization", async () => {
    const [other] = await db
      .insert(organizations)
      .values({ slug: `export-other-${Date.now()}`, name: "Other" })
      .returning({ id: organizations.id });

    expect(await buildMemberDataExport({ orgId: other.id, memberId })).toBeNull();

    await db.delete(organizations).where(eq(organizations.id, other.id));
  });

  it("gathers the member's own record and everything hanging off it", async () => {
    const data = await buildMemberDataExport({ orgId, memberId });

    expect(data).not.toBeNull();
    expect(data!.member).toMatchObject({
      firstName: "Eva",
      lastName: "Nováková",
      email: "eva@example.test",
    });
    expect(data!.customFieldAnswers).toEqual([
      expect.objectContaining({ label: "Phone number", value: "+420123456789" }),
    ]);
    expect(data!.groupAssignments).toEqual([
      expect.objectContaining({ groupName: "Brno", categoryName: "Regions" }),
    ]);
    expect(data!.payments).toHaveLength(1);
    expect(data!.invite).toMatchObject({ status: "sent" });
  });

  it("never discloses security material", async () => {
    const data = await buildMemberDataExport({ orgId, memberId });
    // The `context` prose names these things in order to say they are excluded,
    // so the assertion runs over the data sections only.
    const sections = Object.fromEntries(
      Object.entries(data!).filter(([key]) => key !== "context"),
    );
    const serialised = JSON.stringify(sections);

    // Handing the member their own activation token would let anyone holding
    // the file take over the account.
    expect(serialised).not.toContain("a-secret-token-hash-that-must-not-leak");
    expect(serialised).not.toContain("tokenHash");
    expect(serialised).not.toContain("password");
  });

  it("carries the Art. 15 context, not just the rows", async () => {
    const data = await buildMemberDataExport({ orgId, memberId });

    expect(data!.context.controller.name).toBe("Export Test Organization z.s.");
    expect(data!.context.controller.contact).toBe("board@example.test");
    expect(data!.context.lawfulBases.join(" ")).toContain("Art. 9(2)(d)");
    expect(data!.context.yourRights).toContain("Art. 17");
    expect(data!.context.generatedAt).toBeTruthy();
  });

  it("represents empty sections rather than omitting them", async () => {
    const data = await buildMemberDataExport({ orgId, memberId });

    // "We hold none of this" is an answer; a missing key is indistinguishable
    // from a section somebody forgot.
    expect(data!.policyAcknowledgements).toEqual([]);
    expect(data!.emails).toEqual([]);
    expect(data!.workspaceLinks).toEqual([]);
    expect(data!.membershipReports).toEqual([]);
  });

  it("serialises to valid JSON", async () => {
    const data = await buildMemberDataExport({ orgId, memberId });

    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
  });
});
