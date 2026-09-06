import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  memberPolicyAcknowledgements,
  policyDocuments,
  policyVersions,
  tenantMembers,
} from "@/server/db/schema";

/** Every active document for an org, in display order. */
export async function listPolicyDocuments(orgId: string) {
  return db
    .select()
    .from(policyDocuments)
    .where(and(eq(policyDocuments.orgId, orgId), eq(policyDocuments.isActive, true)))
    .orderBy(asc(policyDocuments.sortOrder), asc(policyDocuments.title));
}

/** Every version of a document, newest publication first, drafts included. */
export async function listPolicyVersions(documentId: string) {
  return db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.documentId, documentId))
    .orderBy(desc(policyVersions.publishedAt), desc(policyVersions.createdAt));
}

/**
 * The version currently in force: published, and already effective.
 *
 * A version scheduled for a future date is deliberately not returned — the
 * previous one stays in force until `effectiveFrom` arrives, which is what
 * makes publishing ahead of a deadline safe.
 */
export async function getCurrentPolicyVersion(documentId: string, now = new Date()) {
  const [version] = await db
    .select()
    .from(policyVersions)
    .where(
      and(
        eq(policyVersions.documentId, documentId),
        eq(policyVersions.status, "published"),
        sql`${policyVersions.effectiveFrom} <= ${now}`,
      ),
    )
    .orderBy(desc(policyVersions.effectiveFrom))
    .limit(1);

  return version ?? null;
}

/** The single open draft for a document, if one exists. */
export async function getPolicyDraft(documentId: string) {
  const [draft] = await db
    .select()
    .from(policyVersions)
    .where(
      and(eq(policyVersions.documentId, documentId), eq(policyVersions.status, "draft")),
    )
    .limit(1);

  return draft ?? null;
}

/**
 * How many members a publish would affect, split by what they have done so far.
 *
 * Shown in the publish dialog before anything is written, because "312 members
 * will be asked to re-acknowledge" is the number that stops a careless publish
 * — and it is the recipient count if the admin also chooses to email them.
 *
 * Deleted members are excluded: they are not going to log in, and counting
 * them makes the number look alarming for no reason.
 */
export async function countPolicyAudience(orgId: string, documentId: string) {
  const current = await getCurrentPolicyVersion(documentId);

  const activeMembers = and(
    eq(tenantMembers.orgId, orgId),
    ne(tenantMembers.status, "deleted"),
    isNull(tenantMembers.deletedAt),
  );

  const [[{ total = 0 } = { total: 0 }], [{ onCurrent = 0 } = { onCurrent: 0 }]] =
    await Promise.all([
      db.select({ total: count() }).from(tenantMembers).where(activeMembers),
      current
        ? db
            .select({ onCurrent: count() })
            .from(tenantMembers)
            .innerJoin(
              memberPolicyAcknowledgements,
              and(
                eq(memberPolicyAcknowledgements.memberId, tenantMembers.id),
                eq(memberPolicyAcknowledgements.policyVersionId, current.id),
              ),
            )
            .where(activeMembers)
        : Promise.resolve([{ onCurrent: 0 }]),
    ]);

  // Anyone who has never acknowledged ANY version of this document — imported
  // members, admin-created members. They are the ones who have never been
  // shown the document at all, which reads differently from being a version
  // behind, and the publish dialog says so.
  const [{ neverShown = 0 } = { neverShown: 0 }] = await db
    .select({ neverShown: count() })
    .from(tenantMembers)
    .where(
      and(
        activeMembers,
        sql`NOT EXISTS (
          SELECT 1
          FROM ${memberPolicyAcknowledgements} a
          JOIN ${policyVersions} v ON v.id = a.policy_version_id
          WHERE a.member_id = ${tenantMembers.id}
            AND v.document_id = ${documentId}
        )`,
      ),
    );

  return {
    total,
    onCurrent,
    neverShown,
    /** Everyone who would be prompted by a material publish. */
    outstanding: total - onCurrent,
  };
}

/**
 * Documents this member still has to act on.
 *
 * The portal gate (MAR-128) is the only caller. Two different reasons land a
 * document here, and conflating them is a bug worth naming:
 *
 * - the member has **never** acknowledged any version of it (imported and
 *   admin-created members). They are always prompted, material or not — they
 *   have not been shown the document at all, so there is nothing to be "still
 *   current" about.
 * - the member is on an older version and the new one is a material change.
 *   A typo fix leaves their existing acknowledgement standing.
 */
export async function listOutstandingPolicies(
  orgId: string,
  memberId: string,
  now = new Date(),
) {
  const documents = await listPolicyDocuments(orgId);

  if (documents.length === 0) {
    return [];
  }

  const currentVersions = (
    await Promise.all(
      documents.map(async (document) => {
        const version = await getCurrentPolicyVersion(document.id, now);
        return version ? { document, version } : null;
      }),
    )
  ).filter((entry) => entry !== null);

  if (currentVersions.length === 0) {
    return [];
  }

  // Every acknowledgement this member holds against any version of these
  // documents — not just the current ones, so "never shown this document"
  // stays distinguishable from "a version behind".
  const acknowledged = await db
    .select({
      documentId: policyVersions.documentId,
      policyVersionId: memberPolicyAcknowledgements.policyVersionId,
    })
    .from(memberPolicyAcknowledgements)
    .innerJoin(
      policyVersions,
      eq(policyVersions.id, memberPolicyAcknowledgements.policyVersionId),
    )
    .where(
      and(
        eq(memberPolicyAcknowledgements.memberId, memberId),
        inArray(
          policyVersions.documentId,
          currentVersions.map((entry) => entry.document.id),
        ),
      ),
    );

  const acknowledgedVersionIds = new Set(acknowledged.map((row) => row.policyVersionId));
  const documentsEverAcknowledged = new Set(acknowledged.map((row) => row.documentId));

  return currentVersions.filter(({ document, version }) => {
    if (acknowledgedVersionIds.has(version.id)) {
      return false;
    }

    return !documentsEverAcknowledged.has(document.id) || version.isMaterialChange;
  });
}
