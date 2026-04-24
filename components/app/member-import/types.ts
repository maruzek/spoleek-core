import type { MemberCustomField } from "@/server/db/schema";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";

export type ParsedRow = Record<string, string>;

export type BuiltinFieldKey =
  | "first_name"
  | "last_name"
  | "email"
  | "workspace_email"
  | "role"
  | "status";

export type FieldTarget = BuiltinFieldKey | `custom:${string}`;

export type GroupAssignmentMode = "none" | "fixed" | "column";

export interface GroupColumnMapping {
  valueToGroupId: Record<string, string | null>;
  columnKey: string;
}

export interface GroupAssignmentConfig {
  mode: GroupAssignmentMode;
  fixedGroupIds: string[];
  columnMapping: GroupColumnMapping | null;
}

export type WizardStep =
  | "upload"
  | "map"
  | "groups"
  | "workspace"
  | "preview"
  | "importing"
  | "done";

export const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  map: "Map Fields",
  groups: "Groups",
  workspace: "Workspace",
  preview: "Preview",
  importing: "Import",
  done: "Done",
};

export type WorkspaceMatch = {
  workspaceUserId: string;
  workspaceUserEmail: string;
  fullName: string;
  source: "email-lookup" | "search" | "provisioned";
};

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFields: MemberCustomField[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  workspaceReady: boolean;
  onDone: () => void;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}
