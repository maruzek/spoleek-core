"use server";

import {
  resolveMailingListResultSchema,
  resolveMailingListSchema,
} from "@/lib/mailing-list";
import { authActionClient } from "@/lib/safe-action-auth";
import { resolvePreferredEmail } from "@/server/lib/preferred-email";
import { resolveMemberDataset } from "@/server/lib/member-datasets";
import { getAppOrganization } from "@/server/queries/app";

function formatMailingList(emails: string[]) {
  return emails.join("; ");
}

export const resolveMailingListAction = authActionClient
  .metadata({ actionName: "resolveMailingList" })
  .inputSchema(resolveMailingListSchema)
  .outputSchema(resolveMailingListResultSchema)
  .action(async ({ parsedInput }) => {
    const dataset = await resolveMemberDataset(parsedInput.scope);
    const selectedMemberIds = new Set(parsedInput.selectedMemberIds);
    const scopedRows =
      selectedMemberIds.size > 0
        ? dataset.filter((row) => selectedMemberIds.has(row.memberId))
        : dataset;

    let orgDefault: "personal" | "workspace" = "personal";
    let workspaceReady = false;

    if (parsedInput.emailType === "preferred") {
      const org = await getAppOrganization();
      orgDefault = org?.defaultEmailPreference ?? "personal";
      workspaceReady = Boolean(
        org?.workspaceModuleEnabled &&
          org?.workspaceConnectedAt &&
          org?.workspaceDomain,
      );
    }

    const seenEmails = new Set<string>();
    const emails: string[] = [];
    let skippedNoEmailCount = 0;
    let dedupedCount = 0;

    for (const row of scopedRows) {
      let email: string | null = null;

      if (parsedInput.emailType === "personal") {
        email = row.personalEmail;
      } else if (parsedInput.emailType === "workspace") {
        email = row.workspaceEmail ?? row.personalEmail;
      } else {
        email = resolvePreferredEmail({
          personalEmail: row.personalEmail,
          workspaceEmail: row.workspaceEmail,
          memberPreference: row.preferredEmailSetting,
          orgDefault,
          workspaceReady,
        });
      }

      if (!email) {
        skippedNoEmailCount += 1;
        continue;
      }

      if (seenEmails.has(email)) {
        dedupedCount += 1;
        continue;
      }

      seenEmails.add(email);
      emails.push(email);
    }

    return {
      copiedText: formatMailingList(emails),
      emails,
      resolvedCount: scopedRows.length,
      copiedCount: emails.length,
      skippedNoEmailCount,
      dedupedCount,
    };
  });
