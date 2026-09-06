"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import {
  discardPolicyDraftSchema,
  publishPolicyVersionSchema,
  savePolicyDraftSchema,
} from "@/lib/policies";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { policyDocuments, policyVersions } from "@/server/db/schema";
import { isPolicyHtmlEmpty, sanitizePolicyHtml } from "@/server/lib/policy-html";
import { requireOrgAdminAccess } from "@/server/queries/access";
import { getCurrentPolicyVersion } from "@/server/queries/policies";

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

    if (!draft) {
      throw new Error("There is no draft to publish.");
    }

    // Publishing an empty legal document is always a mistake, and `body_html`
    // defaults to an empty string, so nothing upstream would have caught it.
    if (isPolicyHtmlEmpty(draft.bodyHtml)) {
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

    await db.transaction(async (tx) => {
      if (previous) {
        await tx
          .update(policyVersions)
          .set({ status: "archived", updatedAt: publishedAt })
          .where(eq(policyVersions.id, previous.id));
      }

      await tx
        .update(policyVersions)
        .set({
          version: parsedInput.version,
          status: "published",
          isMaterialChange: parsedInput.isMaterialChange,
          summaryOfChanges: parsedInput.summaryOfChanges,
          effectiveFrom: parsedInput.effectiveFrom,
          publishedAt,
          publishedByUserId: ctx.auth.user.id,
          updatedAt: publishedAt,
        })
        .where(eq(policyVersions.id, draft.id));
    });

    revalidatePath("/admin/settings");
    revalidatePath(`/legal/${document.slug}`);

    return { success: true as const, versionId: draft.id };
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
