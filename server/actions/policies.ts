"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, count, eq, max } from "drizzle-orm";

import {
  acknowledgePoliciesSchema,
  createPolicyDocumentSchema,
  deletePolicyDocumentSchema,
  discardPolicyDraftSchema,
  publishPolicyVersionSchema,
  renamePolicyDocumentSchema,
  savePolicyDraftSchema,
  setPolicyDocumentActiveSchema,
} from "@/lib/policies";
import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  memberPolicyAcknowledgements,
  policyDocuments,
  policyVersions,
} from "@/server/db/schema";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { notifyPolicyVersionPublished } from "@/server/notifications/policies";
import { isPolicyHtmlEmpty, sanitizePolicyHtml } from "@/server/lib/policy-html";
import { requireOrgAdminAccess } from "@/server/queries/access";
import {
  getCurrentPolicyVersion,
  listOutstandingPolicies,
} from "@/server/queries/policies";

/**
 * Loads a document and proves it belongs to the caller's org.
 *
 * Every action here takes a `documentId` from the client, so this is the
 * tenant boundary: without it an org admin could address another org's
 * documents by id.
 */
async function requirePolicyDocument(documentId: string) {
  const { organization } = await requireOrgAdminAccess();

  const [document] = await db
    .select()
    .from(policyDocuments)
    .where(
      and(eq(policyDocuments.id, documentId), eq(policyDocuments.orgId, organization.id)),
    )
    .limit(1);

  if (!document) {
    throw new Error("Policy document not found.");
  }

  return { organization, document };
}

/**
 * Writes the working draft for a document, creating it on first save.
 *
 * A published version is never touched: editing one produces a draft, which is
 * what keeps the text somebody accepted intact. The partial unique index
 * `policy_versions_document_draft_idx` makes "the draft" singular in the
 * database rather than only by convention here.
 *
 * The body is sanitized on the way in even though nothing publishes it yet —
 * a draft is previewable, and storing raw HTML anywhere invites someone to
 * render it later without thinking.
 */
export const savePolicyDraftAction = orgAdminActionClient
  .metadata({ actionName: "savePolicyDraft" })
  .inputSchema(savePolicyDraftSchema)
  .action(async ({ parsedInput }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);
    const bodyHtml = sanitizePolicyHtml(parsedInput.bodyHtml);

    const [existing] = await db
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.documentId, document.id),
          eq(policyVersions.status, "draft"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(policyVersions)
        .set({ bodyHtml, updatedAt: new Date() })
        .where(eq(policyVersions.id, existing.id));

      return { success: true as const, draftId: existing.id };
    }

    // `version` stays null until publish: the label is the admin's choice at
    // that point, and a placeholder would put a fake version into the public
    // archived URL space.
    const [created] = await db
      .insert(policyVersions)
      .values({ documentId: document.id, bodyHtml })
      .returning({ id: policyVersions.id });

    return { success: true as const, draftId: created.id };
  });

/**
 * Publishes the open draft as a new immutable version.
 *
 * The previous published version is archived rather than deleted: it is the
 * text an existing acknowledgement points at, and `member_policy_acknowledgements`
 * holds a `restrict` foreign key onto it, so deleting it is impossible anyway.
 */
export const publishPolicyVersionAction = orgAdminActionClient
  .metadata({ actionName: "publishPolicyVersion" })
  .inputSchema(publishPolicyVersionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);

    const [draft] = await db
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.documentId, document.id),
          eq(policyVersions.status, "draft"),
        ),
      )
      .limit(1);

    // The body comes from the editor when the admin publishes directly, and
    // from the open draft otherwise. Requiring a saved draft first would make
    // the common case — write it, publish it — a two-step ritual for no gain.
    const bodyHtml =
      parsedInput.bodyHtml !== undefined
        ? sanitizePolicyHtml(parsedInput.bodyHtml)
        : (draft?.bodyHtml ?? "");

    // Publishing an empty legal document is always a mistake, and `body_html`
    // defaults to an empty string, so nothing upstream would have caught it.
    if (isPolicyHtmlEmpty(bodyHtml)) {
      throw new Error("The document is empty. Add its text before publishing.");
    }

    const [labelTaken] = await db
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.documentId, document.id),
          eq(policyVersions.version, parsedInput.version),
        ),
      )
      .limit(1);

    if (labelTaken && labelTaken.id !== draft.id) {
      throw new Error(`Version "${parsedInput.version}" already exists.`);
    }

    const publishedAt = new Date();
    const previous = await getCurrentPolicyVersion(document.id, publishedAt);
    let publishedVersionId = "";

    await db.transaction(async (tx) => {
      if (previous) {
        await tx
          .update(policyVersions)
          .set({ status: "archived", updatedAt: publishedAt })
          .where(eq(policyVersions.id, previous.id));
      }

      const fields = {
        version: parsedInput.version,
        status: "published" as const,
        bodyHtml,
        isMaterialChange: parsedInput.isMaterialChange,
        summaryOfChanges: parsedInput.summaryOfChanges,
        effectiveFrom: parsedInput.effectiveFrom,
        publishedAt,
        publishedByUserId: ctx.auth.user.id,
        updatedAt: publishedAt,
      };

      // An open draft is consumed by the publish rather than left behind, so
      // the document is never both "published v2" and "has an unsaved v2 draft".
      if (draft) {
        await tx
          .update(policyVersions)
          .set(fields)
          .where(eq(policyVersions.id, draft.id));

        publishedVersionId = draft.id;
        return;
      }

      const [inserted] = await tx
        .insert(policyVersions)
        .values({ documentId: document.id, ...fields })
        .returning({ id: policyVersions.id });

      publishedVersionId = inserted.id;
    });

    revalidatePath("/admin/settings");
    revalidatePath(`/legal/${document.slug}`);

    // Deliberately after the response: mailing several hundred members must not
    // hold the publish open, and a mailer outage must not fail a version that
    // is already in force and already enforced by the portal gate.
    if (parsedInput.notifyMembers) {
      after(() =>
        notifyPolicyVersionPublished({
          orgId: document.orgId,
          documentId: document.id,
          versionId: publishedVersionId,
        }),
      );
    }

    return { success: true as const, versionId: publishedVersionId };
  });

/** Throws the working draft away. Published versions are untouchable. */
export const discardPolicyDraftAction = orgAdminActionClient
  .metadata({ actionName: "discardPolicyDraft" })
  .inputSchema(discardPolicyDraftSchema)
  .action(async ({ parsedInput }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);

    await db
      .delete(policyVersions)
      .where(
        and(
          eq(policyVersions.documentId, document.id),
          eq(policyVersions.status, "draft"),
        ),
      );

    revalidatePath("/admin/settings");

    return { success: true as const };
  });

/**
 * Creates a document. The slug is fixed at creation and never edited.
 *
 * A legal document's URL is quoted in emails, in the registration record and
 * potentially in a regulator's file, so it is exactly the thing that must not
 * rot. The title is free to change; the address is not.
 */
export const createPolicyDocumentAction = orgAdminActionClient
  .metadata({ actionName: "createPolicyDocument" })
  .inputSchema(createPolicyDocumentSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    const [taken] = await db
      .select({ id: policyDocuments.id })
      .from(policyDocuments)
      .where(
        and(
          eq(policyDocuments.orgId, organization.id),
          eq(policyDocuments.slug, parsedInput.slug),
        ),
      )
      .limit(1);

    if (taken) {
      throw new Error(`The slug "${parsedInput.slug}" is already in use.`);
    }

    const [{ highest = -1 } = { highest: -1 }] = await db
      .select({ highest: max(policyDocuments.sortOrder) })
      .from(policyDocuments)
      .where(eq(policyDocuments.orgId, organization.id));

    const [created] = await db
      .insert(policyDocuments)
      .values({
        orgId: organization.id,
        kind: parsedInput.kind,
        slug: parsedInput.slug,
        title: parsedInput.title,
        requiresAcceptance: parsedInput.requiresAcceptance,
        sortOrder: (highest ?? -1) + 1,
      })
      .returning({ id: policyDocuments.id });

    revalidatePath("/admin/settings");

    return { success: true as const, documentId: created.id };
  });

/** Renames a document. Titles are display text; the slug stays put. */
export const renamePolicyDocumentAction = orgAdminActionClient
  .metadata({ actionName: "renamePolicyDocument" })
  .inputSchema(renamePolicyDocumentSchema)
  .action(async ({ parsedInput }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);

    await db
      .update(policyDocuments)
      .set({ title: parsedInput.title, updatedAt: new Date() })
      .where(eq(policyDocuments.id, document.id));

    revalidatePath("/admin/settings");
    revalidatePath(`/legal/${document.slug}`);

    return { success: true as const };
  });

/**
 * Retires a document without destroying its record.
 *
 * A deactivated document drops out of the portal gate and the public index,
 * but every acknowledgement against it stays readable. That is the honest way
 * to stop using a document: what people agreed to in the past did happen.
 */
export const setPolicyDocumentActiveAction = orgAdminActionClient
  .metadata({ actionName: "setPolicyDocumentActive" })
  .inputSchema(setPolicyDocumentActiveSchema)
  .action(async ({ parsedInput }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);

    await db
      .update(policyDocuments)
      .set({ isActive: parsedInput.isActive, updatedAt: new Date() })
      .where(eq(policyDocuments.id, document.id));

    revalidatePath("/admin/settings");
    revalidatePath(`/legal/${document.slug}`);

    return { success: true as const };
  });

/**
 * Deletes a document, but only while nobody has ever acknowledged it.
 *
 * The `restrict` foreign key on `member_policy_acknowledgements` would refuse
 * the delete anyway; checking here turns a raw constraint violation into a
 * sentence that says why, and points at deactivation instead.
 */
export const deletePolicyDocumentAction = orgAdminActionClient
  .metadata({ actionName: "deletePolicyDocument" })
  .inputSchema(deletePolicyDocumentSchema)
  .action(async ({ parsedInput }) => {
    const { document } = await requirePolicyDocument(parsedInput.documentId);

    const [{ acknowledgements = 0 } = { acknowledgements: 0 }] = await db
      .select({ acknowledgements: count() })
      .from(memberPolicyAcknowledgements)
      .innerJoin(
        policyVersions,
        eq(policyVersions.id, memberPolicyAcknowledgements.policyVersionId),
      )
      .where(eq(policyVersions.documentId, document.id));

    if (acknowledgements > 0) {
      throw new Error(
        `${acknowledgements} member acknowledgement(s) point at this document, so it cannot be deleted. Deactivate it instead — the record stays intact and the document leaves the portal and the public index.`,
      );
    }

    await db.delete(policyDocuments).where(eq(policyDocuments.id, document.id));

    revalidatePath("/admin/settings");

    return { success: true as const };
  });

/**
 * Records a member acting on the documents blocking their portal.
 *
 * Member-facing, so it uses `authActionClient` rather than the admin client,
 * and it calls `requireCurrentMemberAccess` with no options — gating it on
 * policy acknowledgement would redirect the very request that clears the gate.
 *
 * The submitted ids are filtered against what is genuinely outstanding for
 * this member. A crafted request therefore cannot record consent to a version
 * the member was never shown, and replaying one is harmless: the unique index
 * on (member_id, policy_version_id) keeps the first acknowledgement, which is
 * the one with the honest timestamp.
 */
export const acknowledgePoliciesAction = authActionClient
  .metadata({ actionName: "acknowledgePolicies" })
  .inputSchema(acknowledgePoliciesSchema)
  .action(async ({ parsedInput }) => {
    const { member, organization } = await requireCurrentMemberAccess();

    const outstanding = await listOutstandingPolicies(organization.id, member.id);
    const outstandingIds = new Set(outstanding.map((entry) => entry.version.id));
    const accepted = parsedInput.policyVersionIds.filter((id) =>
      outstandingIds.has(id),
    );

    if (accepted.length === 0) {
      return { success: true as const, recorded: 0, remaining: outstanding.length };
    }

    await db
      .insert(memberPolicyAcknowledgements)
      .values(
        accepted.map((policyVersionId) => ({
          orgId: organization.id,
          memberId: member.id,
          policyVersionId,
          method: "portal_prompt" as const,
        })),
      )
      .onConflictDoNothing();

    revalidatePath("/portal", "layout");

    return {
      success: true as const,
      recorded: accepted.length,
      remaining: outstanding.length - accepted.length,
    };
  });
