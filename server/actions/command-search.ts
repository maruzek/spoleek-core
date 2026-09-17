"use server";

import { z } from "zod";

import { COMMAND_SEARCH_MIN_LENGTH } from "@/lib/command-palette";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { requireOrganization } from "@/server/queries/access";
import {
  searchCommandPalette,
  type CommandSearchResult,
} from "@/server/queries/command-search";

const commandSearchSchema = z.object({
  query: z.string().trim().min(COMMAND_SEARCH_MIN_LENGTH).max(100),
});

/**
 * Backs the ⌘K palette. Read-only: it returns links, never mutates.
 *
 * The client checks `COMMAND_SEARCH_MIN_LENGTH` first, so a too-short query
 * never leaves the browser; the schema is the backstop.
 */
export const commandSearchAction = orgAdminActionClient
  .metadata({ actionName: "commandSearch" })
  .inputSchema(commandSearchSchema)
  .action(async ({ parsedInput }): Promise<CommandSearchResult> => {
    const organization = await requireOrganization();
    return searchCommandPalette(organization.id, parsedInput.query);
  });
