import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import type { WorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";
import type { MemberCustomField } from "@/server/db/schema";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";

export type ImportGroupInfo = {
  id: string;
  name: string;
  categoryId: string;
  workspaceOrgUnitPath: string | null;
};

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

/**
 * What a step tells the footer about itself. The footer renders purely from
 * this — it has no knowledge of any individual step, so a new step cannot
 * silently forget to declare its constraints.
 *
 * Precedence when several apply: `blocked` > `busy` > `pending`.
 */
export type StepGate = {
  /** Cannot advance at all, and why. */
  blocked?: { reason: string };
  /** Async work is running inside the step; advancing would abandon it. */
  busy?: boolean;
  /** Advancing is allowed but loses something; confirm names the cost. */
  pending?: { summary: string; detail: string };
};

export type WorkspaceMatch = {
  workspaceUserId: string;
  workspaceUserEmail: string;
  fullName: string;
  source: "email-lookup" | "search" | "provisioned";
};

/** A candidate returned by the Workspace directory search. */
export type WorkspaceSearchHit = {
  id: string;
  primaryEmail: string;
  fullName: string;
};

/**
 * One CSV row as the Workspace table renders it. Rows are keyed by `rowIdx`
 * and are never filtered out of the list — resolving a row changes its state
 * in place rather than removing it.
 */
export type WorkspaceRowView = {
  rowIdx: number;
  name: string;
  sourceEmail: string;
  match: WorkspaceMatch | undefined;
  /** undefined = not searched yet, null = searched with no result. */
  hit: WorkspaceSearchHit | null | undefined;
  provisioning: "loading" | "error" | undefined;
  provisionError: string | undefined;
  targetEmail: string;
  selected: boolean;
  expanded: boolean;
  fieldValues: WorkspaceFieldValues;
  requiredMissing: boolean;
};

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFields: MemberCustomField[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  workspaceReady: boolean;
  workspaceProvisionFields?: EnabledProvisionField[];
  groupsById?: Map<string, ImportGroupInfo>;
  orgUnitCategoryId?: string | null;
  onDone: () => void;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}
