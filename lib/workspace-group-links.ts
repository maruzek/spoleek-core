import { z } from "zod";

import type {
  WorkspaceGroupRole,
  WorkspaceLinkDirection,
  WorkspaceLinkRemovalPolicy,
} from "@/server/db/schema";

/**
 * Direction copy lives next to the schema because the whole point is that the
 * admin reads the consequence in the form rather than having to infer which
 * system wins. `{group}` is replaced with the Google group address.
 */
export const workspaceLinkDirectionOptions: Array<{
  value: WorkspaceLinkDirection;
  label: string;
  description: string;
}> = [
  {
    value: "push",
    label: "Spoleek manages this group",
    description:
      "People you add here are added to {group}. Someone added directly in the Google Admin console shows up for review, and is never removed automatically.",
  },
  {
    value: "observe",
    label: "Watch only",
    description:
      "Nothing in Google is changed. Differences between {group} and this group are listed for you to review.",
  },
];

export const workspaceGroupRoleOptions: Array<{
  value: WorkspaceGroupRole;
  label: string;
}> = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
];

export const workspaceLinkRemovalPolicyOptions: Array<{
  value: WorkspaceLinkRemovalPolicy;
  label: string;
  description: string;
}> = [
  {
    value: "remove_owned",
    label: "Remove only what Spoleek added",
    description:
      "Someone who leaves this group is removed from the Google group. Addresses added elsewhere — an admin in the console, an external subscriber — are reported, never deleted.",
  },
  {
    value: "remove_all",
    label: "Remove anyone unexpected",
    description:
      "The Google group is made to match this group exactly. Externals and manual additions are deleted.",
  },
  {
    value: "keep",
    label: "Never remove anyone",
    description:
      "People are only ever added. Leaving this group does not remove them from the Google group.",
  },
];

/**
 * One row of the dry-run table. The preview is the same plan the reconciler
 * will act on, flattened so the admin can read it person by person instead of
 * trusting four counters.
 */
export type WorkspaceLinkPlanAction =
  | "add"
  | "role_change"
  | "remove"
  | "drift"
  | "adopt"
  | "skip";

export type WorkspaceLinkPlanRow = {
  action: WorkspaceLinkPlanAction;
  address: string;
  name: string | null;
  currentRole: WorkspaceGroupRole | null;
  nextRole: WorkspaceGroupRole | null;
  note: string | null;
};

export const workspaceLinkPlanActionMeta: Record<
  WorkspaceLinkPlanAction,
  { label: string; variant: "default" | "success" | "error" | "warning" | "info" }
> = {
  add: { label: "Add", variant: "success" },
  role_change: { label: "Change role", variant: "info" },
  remove: { label: "Remove", variant: "error" },
  drift: { label: "Leave alone", variant: "warning" },
  adopt: { label: "Adopt", variant: "info" },
  skip: { label: "Skip", variant: "default" },
};

export const workspaceLinkSettingsSchema = z.object({
  direction: z.enum(["push", "observe"]).default("push"),
  memberRole: z.enum(["member", "manager", "owner"]).default("member"),
  adminRole: z.enum(["member", "manager", "owner"]).default("manager"),
  removalPolicy: z
    .enum(["remove_owned", "remove_all", "keep"])
    .default("remove_owned"),
  includeExternal: z.boolean().default(false),
});

export type WorkspaceLinkSettings = z.infer<typeof workspaceLinkSettingsSchema>;

export const defaultWorkspaceLinkSettings: WorkspaceLinkSettings = {
  direction: "push",
  memberRole: "member",
  adminRole: "manager",
  removalPolicy: "remove_owned",
  includeExternal: false,
};

export const createGroupWorkspaceLinkSchema = workspaceLinkSettingsSchema.extend({
  groupId: z.uuid(),
  /** The Google group's email as picked in the combobox; resolved to its id server-side. */
  workspaceGroupKey: z.string().trim().min(3, "Pick a Google group."),
});

export const previewGroupWorkspaceLinkSchema =
  workspaceLinkSettingsSchema.extend({
    groupId: z.uuid(),
    workspaceGroupKey: z.string().trim().min(3, "Pick a Google group."),
  });

export const updateGroupWorkspaceLinkSchema = z.object({
  linkId: z.uuid(),
  direction: z.enum(["push", "observe"]),
  memberRole: z.enum(["member", "manager", "owner"]),
  adminRole: z.enum(["member", "manager", "owner"]),
  removalPolicy: z.enum(["remove_owned", "remove_all", "keep"]),
  includeExternal: z.boolean(),
  isEnabled: z.boolean(),
});

export const syncGroupWorkspaceLinkSchema = z.object({
  linkId: z.uuid(),
  /** When false the caller only wants the plan, not the writes. */
  apply: z.boolean().default(true),
});

export const deleteGroupWorkspaceLinkSchema = z.object({
  linkId: z.uuid(),
  /** Also remove the Google memberships Spoleek created through this link. */
  removeMemberships: z.boolean().default(false),
});

export type CreateGroupWorkspaceLinkValues = z.infer<
  typeof createGroupWorkspaceLinkSchema
>;
export type UpdateGroupWorkspaceLinkValues = z.infer<
  typeof updateGroupWorkspaceLinkSchema
>;

export type WorkspaceLinkHealthInput = {
  isEnabled: boolean;
  direction: WorkspaceLinkDirection;
  lastSyncStatus: "never" | "ok" | "error";
  pendingCount: number;
  failedCount: number;
};

/**
 * One badge that answers "is this link doing its job right now?". Failures beat
 * pending work, and pending work beats a stale success, so the row never claims
 * to be in sync while something is still queued or broken.
 */
export function describeLinkHealth(link: WorkspaceLinkHealthInput): {
  variant: "default" | "success" | "error" | "warning" | "info";
  label: string;
} {
  if (!link.isEnabled) return { variant: "default", label: "Paused" };
  if (link.failedCount > 0)
    return {
      variant: "error",
      label: `${link.failedCount} failed`,
    };
  if (link.pendingCount > 0)
    return {
      variant: "warning",
      label: `${link.pendingCount} pending`,
    };
  if (link.lastSyncStatus === "error") return { variant: "error", label: "Error" };
  if (link.direction === "observe") return { variant: "info", label: "Watching" };
  if (link.lastSyncStatus === "never")
    return { variant: "default", label: "Not synced yet" };
  return { variant: "success", label: "In sync" };
}
