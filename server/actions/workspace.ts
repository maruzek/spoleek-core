"use server";

import { z } from "zod";
import { authActionClient } from "@/lib/safe-action-auth";
import { requireOrganization } from "@/server/queries/access";
import { searchWorkspaceGroups, searchWorkspaceOrgUnits } from "@/server/lib/workspace/client";

export const searchWorkspaceGroupsAction = authActionClient
  .metadata({ actionName: "searchWorkspaceGroups" })
  .inputSchema(z.object({ query: z.string().default("") }))
  .action(async ({ parsedInput }) => {
    const org = await requireOrganization();
    if (!org.workspaceConnectedAt) return [];

    try {
      const groups = await searchWorkspaceGroups(org.id, parsedInput.query);
      return groups;
    } catch (err) {
      console.error("[searchWorkspaceGroups]", err);
      return [];
    }
  });

export const getWorkspaceOrgUnitsAction = authActionClient
  .metadata({ actionName: "getWorkspaceOrgUnits" })
  .inputSchema(z.object({}))
  .action(async () => {
    const org = await requireOrganization();
    if (!org.workspaceConnectedAt) return [];
    
    try {
      const ous = await searchWorkspaceOrgUnits(org.id);
      return ous;
    } catch {
      return [];
    }
  });
