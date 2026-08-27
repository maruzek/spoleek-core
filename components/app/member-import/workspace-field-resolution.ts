import { applyFormatTemplate } from "@/server/lib/workspace/field-catalog";
import type { WorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";

import type {
  FieldTarget,
  GroupAssignmentConfig,
  ImportGroupInfo,
  ParsedRow,
} from "./types";

/**
 * The group a CSV row resolves to, optionally restricted to one category.
 */
export function getAssignedGroup(
  row: ParsedRow,
  groupAssignment: GroupAssignmentConfig,
  groupsById: Map<string, ImportGroupInfo> | undefined,
  categoryId?: string | null,
): ImportGroupInfo | null {
  if (!groupsById) return null;

  let groupId: string | null = null;

  if (groupAssignment.mode === "column" && groupAssignment.columnMapping) {
    const colVal = (row[groupAssignment.columnMapping.columnKey] ?? "").trim();
    const mappedId =
      groupAssignment.columnMapping.valueToGroupId[colVal] ?? null;
    if (mappedId) {
      if (categoryId) {
        const g = groupsById.get(mappedId);
        if (g?.categoryId === categoryId) groupId = mappedId;
      } else {
        groupId = mappedId;
      }
    }
  }

  if (groupAssignment.fixedGroupIds.length > 0) {
    if (!groupId && categoryId) {
      groupId =
        groupAssignment.fixedGroupIds.find((id) => {
          const g = groupsById.get(id);
          return g?.categoryId === categoryId;
        }) ?? null;
    } else if (
      !groupId &&
      (groupAssignment.mode === "fixed" || groupAssignment.mode === "column")
    ) {
      // In "column" mode the fixed groups are the "also assign to these"
      // extras (e.g. an org-unit category not covered by the column mapping) —
      // they should be a valid fallback for category-less fields too, not
      // only when the whole mode is "fixed".
      groupId = groupAssignment.fixedGroupIds[0] ?? null;
    }
  }

  return groupId ? (groupsById.get(groupId) ?? null) : null;
}

/**
 * Pre-fill a row's Workspace provisioning fields from its CSV data, the
 * configured auto-fill sources, and its group assignment.
 */
export function resolveRowFieldValues(
  row: ParsedRow,
  fieldConfigs: EnabledProvisionField[],
  columnMappings: Record<string, FieldTarget | null>,
  groupAssignment: GroupAssignmentConfig,
  groupsById: Map<string, ImportGroupInfo> | undefined,
  orgUnitCategoryId: string | null | undefined,
): WorkspaceFieldValues {
  const result: WorkspaceFieldValues = {};

  const emailCol = Object.entries(columnMappings).find(
    ([, v]) => v === "email",
  )?.[0];
  const memberEmail = emailCol ? (row[emailCol] ?? "").trim() : "";

  for (const field of fieldConfigs) {
    const source = field.source;

    // 1. Try explicit auto-fill source
    if (source && source.type !== "manual") {
      if (source.type === "member_field") {
        const targetMap: Record<string, FieldTarget> = {
          email: "email",
          firstName: "first_name",
          lastName: "last_name",
        };
        const target = targetMap[source.memberFieldKey];
        if (target) {
          const col = Object.entries(columnMappings).find(
            ([, v]) => v === target,
          )?.[0];
          if (col) {
            const val = (row[col] ?? "").trim();
            if (val) {
              result[field.fieldKey] = val;
              continue;
            }
          }
        }
      } else if (source.type === "member_custom_field") {
        const col = Object.entries(columnMappings).find(
          ([, v]) => v === `custom:${source.customFieldKey}`,
        )?.[0];
        if (col) {
          const val = (row[col] ?? "").trim();
          if (val) {
            result[field.fieldKey] = val;
            continue;
          }
        }
      } else if (
        source.type === "group_category" ||
        source.type === "org_unit_auto"
      ) {
        const catId =
          source.type === "group_category"
            ? source.categoryId
            : orgUnitCategoryId;
        const grp = getAssignedGroup(row, groupAssignment, groupsById, catId);
        if (grp) {
          if (source.type === "org_unit_auto") {
            if (grp.workspaceOrgUnitPath) {
              result[field.fieldKey] = grp.workspaceOrgUnitPath;
              continue;
            }
          } else {
            const formatted = applyFormatTemplate(
              source.formatTemplate,
              grp.name,
            );
            if (formatted) {
              result[field.fieldKey] = formatted;
              continue;
            }
          }
        }
      }
    }

    // 2. Smart fallback: derive from CSV mappings / group assignment
    if (field.fieldKey === "recoveryEmail" && memberEmail) {
      result[field.fieldKey] = memberEmail;
    } else if (field.fieldKey === "orgUnitPath") {
      // Prefer the group matching the org-unit category (if configured),
      // but fall back to the plainly assigned group — same lookup as
      // "department" below — since that group may carry its own
      // workspaceOrgUnitPath even outside the configured category.
      const grp =
        getAssignedGroup(row, groupAssignment, groupsById, orgUnitCategoryId) ??
        getAssignedGroup(row, groupAssignment, groupsById);
      if (grp?.workspaceOrgUnitPath) {
        result[field.fieldKey] = grp.workspaceOrgUnitPath;
      }
    } else if (field.fieldKey === "department") {
      const grp = getAssignedGroup(row, groupAssignment, groupsById);
      if (grp) result[field.fieldKey] = grp.name;
    } else if (field.type !== "boolean") {
      // Try matching a mapped custom field by key name
      const col = Object.entries(columnMappings).find(
        ([, v]) => v === `custom:${field.fieldKey}`,
      )?.[0];
      if (col) {
        const val = (row[col] ?? "").trim();
        if (val) result[field.fieldKey] = val;
      }
    }
  }

  return result;
}
