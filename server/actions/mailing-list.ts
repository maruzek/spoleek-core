"use server";

import {
  resolveMailingListResultSchema,
  resolveMailingListSchema,
} from "@/lib/mailing-list";
import { authActionClient } from "@/lib/safe-action-auth";
import { resolveMemberDataset } from "@/server/lib/member-datasets";

function formatMailingList(emails: string[]) {
  return emails.join("; ");
}

export const resolveMailingListAction = authActionClient
  .metadata({ actionName: "resolveMailingList" })
  .inputSchema(resolveMailingListSchema)
  .outputSchema(resolveMailingListResultSchema)
  .action(async ({ parsedInput }) => {
    if (parsedInput.emailType !== "personal") {
      throw new Error("Organization email lists are not available yet.");
    }

    const dataset = await resolveMemberDataset(parsedInput.scope);
    const selectedMemberIds = new Set(parsedInput.selectedMemberIds);
    const scopedRows =
      selectedMemberIds.size > 0
        ? dataset.filter((row) => selectedMemberIds.has(row.memberId))
        : dataset;

    const seenEmails = new Set<string>();
    const emails: string[] = [];
    let skippedNoEmailCount = 0;
    let dedupedCount = 0;

    for (const row of scopedRows) {
      if (!row.personalEmail) {
        skippedNoEmailCount += 1;
        continue;
      }

      if (seenEmails.has(row.personalEmail)) {
        dedupedCount += 1;
        continue;
      }

      seenEmails.add(row.personalEmail);
      emails.push(row.personalEmail);
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
