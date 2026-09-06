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
 * Where the membership stands on this document *right now*.
 *
 * These are facts about the present, not a forecast. The publish dialog turns
 * them into a forecast itself, because the answer depends on the material-change
 * checkbox the admin is still holding:
 *
 * - a material publish asks **everyone** (`total`). Nobody has acknowledged the
 *   new version yet, and the members already on the current one are re-prompted
 *   precisely because the change is material.
 * - a non-material publish asks only `neverShown` — existing acknowledgements
 *   stand, but somebody who has never seen the document is still owed it.
 *
 * Deleted members are excluded: they are not going to log in, and counting them
 * makes the number look alarming for no reason.
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
    /** Active members, the ceiling for any prompt. */
    total,
    /** Acknowledged the version currently in force. */
    onCurrent,
    /** Never acknowledged any version of this document. */
    neverShown,
    /** On an older version: acknowledged something, but not the current one. */
    behindCurrent: Math.max(total - onCurrent - neverShown, 0),
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

/**
 * How many members would actually receive a notification, which is not the same
 * as how many are affected: a member with no usable address is still stopped by
 * the portal gate but cannot be mailed. The dialog shows both numbers so the
 * gap is visible before the send, not discovered in the email log afterwards.
 */
export async function countPolicyNotificationRecipients(params: {
  orgId: string;
  documentId: string;
  isMaterialChange: boolean;
}) {
  const { resolvePolicyNotificationRecipients } = await import(
    "@/server/notifications/policies"
  );

  const recipients = await resolvePolicyNotificationRecipients(params);
  return recipients.length;
}

export type PolicyDocumentRow = Awaited<
  ReturnType<typeof listPolicyDocumentsForAdmin>
>[number];

/**
 * Everything the Legal settings tab renders, in one call.
 *
 * Inactive documents are included here (unlike `listPolicyDocuments`): the
 * admin screen is where a retired document has to stay visible, or
 * deactivating one would look like deleting it.
 */
export async function listPolicyDocumentsForAdmin(orgId: string) {
  const documents = await db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.orgId, orgId))
    .orderBy(asc(policyDocuments.sortOrder), asc(policyDocuments.title));

  return Promise.all(
    documents.map(async (document) => {
      const [versions, current, draft, audience, reachableAll, reachableNeverShown] =
        await Promise.all([
          listPolicyVersions(document.id),
          getCurrentPolicyVersion(document.id),
          getPolicyDraft(document.id),
          countPolicyAudience(orgId, document.id),
          countPolicyNotificationRecipients({
            orgId,
            documentId: document.id,
            isMaterialChange: true,
          }),
          countPolicyNotificationRecipients({
            orgId,
            documentId: document.id,
            isMaterialChange: false,
          }),
        ]);

      return {
        document,
        // Drafts are shown separately, so the history is the real record.
        versions: versions.filter((version) => version.status !== "draft"),
        current,
        draft,
        audience,
        /** Members with a usable address, per publish kind. */
        reachable: { material: reachableAll, nonMaterial: reachableNeverShown },
      };
    }),
  );
}

/** A document by its public slug. Inactive documents stay reachable by URL. */
export async function getPolicyDocumentBySlug(orgId: string, slug: string) {
  const [document] = await db
    .select()
    .from(policyDocuments)
    .where(and(eq(policyDocuments.orgId, orgId), eq(policyDocuments.slug, slug)))
    .limit(1);

  return document ?? null;
}

/**
 * One archived version by its label.
 *
 * Drafts are excluded: an unpublished draft has no public existence, and a
 * guessable URL onto one would leak text the org has not committed to.
 */
export async function getPolicyVersionByLabel(documentId: string, version: string) {
  const [row] = await db
    .select()
    .from(policyVersions)
    .where(
      and(
        eq(policyVersions.documentId, documentId),
        eq(policyVersions.version, version),
        ne(policyVersions.status, "draft"),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * The documents a registration form must collect, with the version in force.
 *
 * Every active document counts: registration is the one moment where the whole
 * set can be presented at once, and a member who joins without seeing the
 * privacy notice is one the portal gate has to stop on their first visit.
 */
export async function listPoliciesForRegistration(orgId: string, now = new Date()) {
  const documents = await listPolicyDocuments(orgId);

  const entries = await Promise.all(
    documents.map(async (document) => {
      const version = await getCurrentPolicyVersion(document.id, now);
      return version ? { document, version } : null;
    }),
  );

  return entries.filter((entry) => entry !== null);
}

/**
 * What a member has acknowledged, newest first, for the admin and portal views.
 *
 * An empty result is meaningful and must not be rendered as a blank date: it
 * means the member has never been shown anything, which is the normal state for
 * an imported or admin-created member and the thing an admin needs to see.
 */
export async function listMemberAcknowledgements(orgId: string, memberId: string) {
  return db
    .select({
      acknowledgedAt: memberPolicyAcknowledgements.acknowledgedAt,
      method: memberPolicyAcknowledgements.method,
      documentId: policyDocuments.id,
      documentTitle: policyDocuments.title,
      documentSlug: policyDocuments.slug,
      requiresAcceptance: policyDocuments.requiresAcceptance,
      version: policyVersions.version,
      versionId: policyVersions.id,
    })
    .from(memberPolicyAcknowledgements)
    .innerJoin(
      policyVersions,
      eq(policyVersions.id, memberPolicyAcknowledgements.policyVersionId),
    )
    .innerJoin(policyDocuments, eq(policyDocuments.id, policyVersions.documentId))
    .where(
      and(
        eq(memberPolicyAcknowledgements.orgId, orgId),
        eq(memberPolicyAcknowledgements.memberId, memberId),
      ),
    )
    .orderBy(desc(memberPolicyAcknowledgements.acknowledgedAt));
}

/**
 * Records a member's acknowledgements inside an existing transaction.
 *
 * Shared by every path where a member genuinely acts: the public join form and
 * the authenticated registration flow. Import and admin-create deliberately do
 * NOT call it — nobody acted there, and a fabricated record is worse than an
 * empty one.
 */
export async function recordPolicyAcknowledgements(
  tx: Pick<typeof db, "insert">,
  params: {
    orgId: string;
    memberId: string;
    policyVersionIds: string[];
    method: "registration" | "portal_prompt" | "admin_recorded" | "import_notice";
  },
) {
  if (params.policyVersionIds.length === 0) {
    return;
  }

  await tx
    .insert(memberPolicyAcknowledgements)
    .values(
      params.policyVersionIds.map((policyVersionId) => ({
        orgId: params.orgId,
        memberId: params.memberId,
        policyVersionId,
        method: params.method,
      })),
    )
    .onConflictDoNothing();
}
