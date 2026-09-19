"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { emailActivities } from "@/server/db/schema";
import { getMailer } from "@/server/notifications/send";
import { requireOrgAdminAccess } from "@/server/queries/access";

export type EmailPreview = {
  html: string | null;
  text: string | null;
  subject: string | null;
  /** Why there is nothing to show, when both bodies are null. */
  unavailableReason: string | null;
};

/**
 * Spoleek stores delivery metadata for every email but never the body, so the
 * rendered message is fetched from Resend on demand instead of being
 * duplicated into our database. That keeps the preview honest — it is what the
 * provider actually holds — at the cost of one API call per open and a
 * dependency on Resend's retention window.
 */
export const getEmailPreviewAction = orgAdminActionClient
  .metadata({ actionName: "getEmailPreview" })
  .inputSchema(z.object({ emailActivityId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }): Promise<EmailPreview> => {
    const { organization } = await requireOrgAdminAccess(ctx.viewer);

    // Scoped by org so an id from another tenant cannot be used to read mail.
    const [activity] = await db
      .select({
        providerEmailId: emailActivities.providerEmailId,
        subject: emailActivities.subject,
      })
      .from(emailActivities)
      .where(
        and(
          eq(emailActivities.id, parsedInput.emailActivityId),
          eq(emailActivities.orgId, organization.id),
        ),
      )
      .limit(1);

    if (!activity) {
      return {
        html: null,
        text: null,
        subject: null,
        unavailableReason: "This email record could not be found.",
      };
    }

    if (!activity.providerEmailId) {
      return {
        html: null,
        text: null,
        subject: activity.subject,
        unavailableReason:
          "This email was never accepted by the provider, so no rendered copy exists.",
      };
    }

    try {
      const copy = await getMailer().fetchCopy(activity.providerEmailId);

      if (!copy) {
        return {
          html: null,
          text: null,
          subject: activity.subject,
          unavailableReason:
            "Resend did not return a copy of this email. It may have aged out of retention.",
        };
      }

      return {
        html: copy.html,
        text: copy.text,
        subject: copy.subject ?? activity.subject,
        unavailableReason:
          copy.html || copy.text
            ? null
            : "Resend holds this email but returned no body content.",
      };
    } catch (error) {
      // A missing API key or a provider outage must not break the sheet — the
      // delivery metadata beside the preview is still worth reading.
      return {
        html: null,
        text: null,
        subject: activity.subject,
        unavailableReason:
          error instanceof Error
            ? error.message
            : "The email preview could not be loaded.",
      };
    }
  });
