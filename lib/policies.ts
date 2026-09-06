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
});

export const discardPolicyDraftSchema = z.object({
  documentId: z.uuid(),
});

export type SavePolicyDraftInput = z.infer<typeof savePolicyDraftSchema>;
export type PublishPolicyVersionInput = z.infer<typeof publishPolicyVersionSchema>;
