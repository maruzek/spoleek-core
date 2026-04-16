import { z } from "zod";

import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";

const tenantRoleSchema = z.enum(["member", "leader", "org_admin"]);
const membershipStatusSchema = z.enum(["invited", "pending", "active", "archived"]);

const emailSchema = z.union([z.literal(""), z.email("Enter a valid email.")]).default("");

export const adminMemberIdentitySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: emailSchema,
  role: tenantRoleSchema.default("member"),
  status: membershipStatusSchema.default("active"),
});

export const createMemberSchema = adminMemberIdentitySchema;

export const updateMemberSchema = adminMemberIdentitySchema.extend({
  memberId: z.string().uuid(),
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export type CreateMemberValues = z.infer<typeof createMemberSchema>;
export type UpdateMemberValues = z.infer<typeof updateMemberSchema>;
