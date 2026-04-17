import { z } from "zod";

export const mailingListScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("members-admin"),
  }),
  z.object({
    kind: z.literal("group-members"),
    contextId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("group-admins"),
    contextId: z.string().uuid(),
  }),
]);

export const mailingListEmailTypeSchema = z.enum(["personal", "organization"]);

export const resolveMailingListSchema = z.object({
  scope: mailingListScopeSchema,
  selectedMemberIds: z.array(z.string().uuid()).default([]),
  emailType: mailingListEmailTypeSchema.default("personal"),
});

export const resolveMailingListResultSchema = z.object({
  copiedText: z.string(),
  emails: z.array(z.string().email()),
  resolvedCount: z.number().int().nonnegative(),
  copiedCount: z.number().int().nonnegative(),
  skippedNoEmailCount: z.number().int().nonnegative(),
  dedupedCount: z.number().int().nonnegative(),
});

export type MailingListScope = z.infer<typeof mailingListScopeSchema>;
export type MailingListEmailType = z.infer<typeof mailingListEmailTypeSchema>;
export type ResolveMailingListInput = z.infer<typeof resolveMailingListSchema>;
export type ResolveMailingListResult = z.infer<typeof resolveMailingListResultSchema>;
