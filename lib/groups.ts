import { z } from "zod";

import type {
  GroupCategorySelectionMode,
  GroupJoinPolicy,
  GroupMembershipRole,
} from "@/server/db/schema";

const nullableTrimmedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  });

export const groupCategorySelectionModeOptions: Array<{
  value: GroupCategorySelectionMode;
  label: string;
}> = [
  { value: "single", label: "Single selection" },
  { value: "multiple", label: "Multiple selections" },
];

export const groupJoinPolicyOptions: Array<{
  value: GroupJoinPolicy;
  label: string;
  description: string;
}> = [
  {
    value: "admin_only",
    label: "Admin only",
    description: "Only managers can place members into this group.",
  },
  {
    value: "free_join_leave",
    label: "Free join and leave",
    description: "Members may eventually join or leave on their own.",
  },
  {
    value: "request_to_join",
    label: "Request to join",
    description: "Request workflows will come later, but the policy can be stored now.",
  },
];

export const groupMembershipRoleOptions: Array<{
  value: GroupMembershipRole;
  label: string;
}> = [
  { value: "member", label: "Member" },
  { value: "group_admin", label: "Group admin" },
];

const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug is required.")
  .regex(
    /^[a-z0-9-]+$/,
    "Slug can only contain lowercase letters, numbers, and hyphens.",
  );

export const groupCategorySchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Name is required."),
    slug: slugSchema,
    description: nullableTrimmedString,
    isActive: z.boolean().default(true),
    isPinnedToNavigation: z.boolean().default(false),
    showInRegistration: z.boolean().default(false),
    selectionMode: z.enum(["single", "multiple"]).default("multiple"),
    selectionRequired: z.boolean().default(false),
    maxSelections: z.union([z.number().int().min(1), z.null()]).default(null),
    defaultJoinPolicy: z
      .enum(["admin_only", "free_join_leave", "request_to_join"])
      .default("admin_only"),
    sortOrder: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.selectionMode === "single" && value.maxSelections !== null && value.maxSelections !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["maxSelections"],
        message: "Single-selection categories can allow at most one group.",
      });
    }
  });

export const groupSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2, "Name is required."),
  slug: slugSchema,
  description: nullableTrimmedString,
  joinPolicy: z
    .enum(["admin_only", "free_join_leave", "request_to_join"])
    .default("admin_only"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const assignCategoryAdminSchema = z.object({
  categoryId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const removeCategoryAdminSchema = assignCategoryAdminSchema;

export const assignGroupMemberSchema = z.object({
  groupId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const removeGroupMemberSchema = assignGroupMemberSchema;

export const assignGroupAdminSchema = assignGroupMemberSchema;

export const removeGroupAdminSchema = assignGroupMemberSchema;

export type GroupCategoryFormValues = z.infer<typeof groupCategorySchema>;
export type GroupFormValues = z.infer<typeof groupSchema>;
