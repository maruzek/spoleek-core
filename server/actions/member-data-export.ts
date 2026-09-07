"use server";

import { z } from "zod";

import { authActionClient } from "@/lib/safe-action-auth";
import {
  buildMemberDataExport,
  buildMemberDataExportFilename,
} from "@/server/lib/member-data-export";
import { logMemberAuthEvent } from "@/server/lib/member-invites";
import {
  canAccessMemberInScope,
  resolveMemberManagementScope,
} from "@/server/lib/member-management-scope";
import { requireCurrentMemberAccess, requireOrganization } from "@/server/queries/access";

/**
 * Art. 15 and Art. 20, in the two places a request actually arrives.
 *
 * The self-service one is the one that saves the organization work: most
 * requests never become a ticket at all if the member can simply click. The
 * admin one exists for the request that arrives by email anyway, and for a
 * member with no login.
 *
 * Both hand the payload back for the browser to save. Nothing about the export
 * is cached or written to disk server-side — it is rebuilt per request, so it
 * cannot go stale and there is no second copy of the member's data to look
 * after.
 */

/** The export is a read of everything about a member, so it is worth recording. */
async function recordExportEvent({
  orgId,
  memberId,
  actorUserId,
  message,
}: {
  orgId: string;
  memberId: string;
  actorUserId: string | null;
  message: string;
}) {
  await logMemberAuthEvent({
    orgId,
    memberId,
    actorUserId,
    eventType: "data_exported",
    message,
  }).catch(() => undefined);
}

export const exportMemberDataAction = authActionClient
  .metadata({ actionName: "exportMemberData" })
  .inputSchema(z.object({ memberId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);

    const inScope = await canAccessMemberInScope(
      organization.id,
      parsedInput.memberId,
      scope,
    );

    // Out-of-scope members are indistinguishable from missing ones, matching
    // the member detail route.
    if (!inScope) {
      throw new Error("The selected member could not be found.");
    }

    const data = await buildMemberDataExport({
      orgId: organization.id,
      memberId: parsedInput.memberId,
    });

    if (!data) {
      throw new Error("The selected member could not be found.");
    }

    await recordExportEvent({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      actorUserId: ctx.auth.user.id,
      message: "Data export produced by an administrator.",
    });

    return {
      filename: buildMemberDataExportFilename(data.member),
      json: JSON.stringify(data, null, 2),
    };
  });

export const exportMyDataAction = authActionClient
  .metadata({ actionName: "exportMyData" })
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    // No member id from the client: a member exports themselves and nobody
    // else, so the id comes from the session.
    const { member, organization } = await requireCurrentMemberAccess();

    const data = await buildMemberDataExport({
      orgId: organization.id,
      memberId: member.id,
    });

    if (!data) {
      throw new Error("Your member record could not be found.");
    }

    await recordExportEvent({
      orgId: organization.id,
      memberId: member.id,
      actorUserId: ctx.auth.user.id,
      message: "Data export downloaded by the member.",
    });

    return {
      filename: buildMemberDataExportFilename(data.member),
      json: JSON.stringify(data, null, 2),
    };
  });
