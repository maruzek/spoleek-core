import { z } from "zod";

/**
 * Input contracts for the policy actions.
 *
 * Kept out of `server/` so the editor and the publish dialog can validate the
 * same shapes on the client; the actions re-validate on the server, where the
 * sanitizer is the real boundary.
 */

/**
 * A version label is admin-chosen ("2.0", "2026-09") rather than generated.
 * It appears in the public archived URL `/legal/<slug>/v/<version>` and in the
 * acknowledgement record, so it is restricted to characters that survive a URL
 * without escaping and read the same in an email.
 */
export const policyVersionLabelSchema = z
  .string()
  .trim()
  .min(1, "Version label is required.")
  .max(40, "Keep the version label short.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Use letters, digits, dots, dashes or underscores.",
  );

export const savePolicyDraftSchema = z.object({
  documentId: z.uuid(),
  bodyHtml: z.string().max(500_000, "The document is too long."),
});

export const publishPolicyVersionSchema = z.object({
  documentId: z.uuid(),
  version: policyVersionLabelSchema,
  /**
   * Whether members must act on this version before using the portal.
   *
   * The admin's call, not a diff heuristic: only a person can say whether a
   * change alters what the member agreed to. Defaults to true, so the safe
   * answer is the one you get by not thinking about it.
   */
  isMaterialChange: z.boolean().default(true),
  summaryOfChanges: z
    .string()
    .trim()
    .max(2000, "Keep the summary short.")
    .default(""),
  /**
   * When the version takes effect. A future date lets an org publish ahead of
   * a deadline; the portal gate ignores versions whose `effectiveFrom` has not
   * arrived, so the current version stays in force until then.
   */
  effectiveFrom: z.coerce.date(),
  /**
   * The body to publish.
   *
   * Optional: when omitted the open draft is published as-is. Passing it lets
   * an admin publish straight from the editor without a separate "save draft"
   * round trip — saving a draft is a convenience for coming back later, not a
   * step the publish flow should require.
   */
  bodyHtml: z.string().max(500_000, "The document is too long.").optional(),
});

export const discardPolicyDraftSchema = z.object({
  documentId: z.uuid(),
});

export type SavePolicyDraftInput = z.infer<typeof savePolicyDraftSchema>;
export type PublishPolicyVersionInput = z.infer<typeof publishPolicyVersionSchema>;

/**
 * Public URL segment for a document: /legal/<slug>.
 *
 * Lowercase and hyphenated so the URL is stable and quotable in an email; the
 * slug is not editable after creation, because links to a legal document are
 * exactly the thing that must not rot.
 */
export const policySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug is required.")
  .max(60, "Keep the slug short.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, digits and single hyphens.",
  );

export const policyTitleSchema = z
  .string()
  .trim()
  .min(2, "Title is required.")
  .max(120, "Keep the title short.");

export const createPolicyDocumentSchema = z.object({
  kind: z.enum(["terms", "privacy", "other"]),
  slug: policySlugSchema,
  title: policyTitleSchema,
  /**
   * True for an agreement the member accepts, false for a disclosure they
   * confirm having read. It drives the prompt wording, not whether the portal
   * is gated — both kinds gate.
   */
  requiresAcceptance: z.boolean(),
});

export const renamePolicyDocumentSchema = z.object({
  documentId: z.uuid(),
  title: policyTitleSchema,
});

export const setPolicyDocumentActiveSchema = z.object({
  documentId: z.uuid(),
  isActive: z.boolean(),
});

export const deletePolicyDocumentSchema = z.object({
  documentId: z.uuid(),
});

export type CreatePolicyDocumentInput = z.infer<typeof createPolicyDocumentSchema>;
