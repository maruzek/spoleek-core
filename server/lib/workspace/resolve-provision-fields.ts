import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
  groups,
  memberCustomFieldValues,
  memberCustomFields,
} from "@/server/db/schema";
import {
  applyFormatTemplate,
  type WorkspaceFieldValues,
  type WorkspaceProvisionFieldConfig,
} from "./field-catalog";

export async function resolveProvisionFieldsForMember(
  orgId: string,
  memberId: string,
  fieldConfigs: WorkspaceProvisionFieldConfig[],
  orgUnitCategoryId: string | null,
): Promise<WorkspaceFieldValues> {
  const result: WorkspaceFieldValues = {};

  const enabledConfigs = fieldConfigs.filter((f) => f.enabled && f.source && f.source.type !== "manual");
  if (enabledConfigs.length === 0) return result;

  // Collect what we need to query
  const needsCustomFields = enabledConfigs.some((f) => f.source?.type === "member_custom_field");
  const groupCategoryIds = new Set<string>();
  for (const f of enabledConfigs) {
    if (f.source?.type === "group_category") groupCategoryIds.add((f.source as { type: "group_category"; categoryId: string }).categoryId);
    if (f.source?.type === "org_unit_auto" && orgUnitCategoryId) groupCategoryIds.add(orgUnitCategoryId);
  }

  // Fetch custom field values for this member if needed
  const customFieldsByKey: Map<string, string> = new Map();
  if (needsCustomFields) {
    const rows = await db
      .select({
        key: memberCustomFields.key,
        value: memberCustomFieldValues.value,
      })
      .from(memberCustomFieldValues)
      .innerJoin(memberCustomFields, eq(memberCustomFieldValues.fieldId, memberCustomFields.id))
      .where(
        and(
          eq(memberCustomFieldValues.memberId, memberId),
          eq(memberCustomFieldValues.orgId, orgId),
        ),
      );
    for (const row of rows) {
      if (row.value !== null && row.value !== undefined) {
        customFieldsByKey.set(row.key, String(row.value));
      }
    }
  }

  // Fetch group memberships for needed categories
  const groupByCategoryId: Map<string, { name: string; workspaceOrgUnitPath: string | null }> = new Map();
  if (groupCategoryIds.size > 0) {
    const rows = await db
      .select({
        categoryId: groups.categoryId,
        name: groups.name,
        workspaceOrgUnitPath: groups.workspaceOrgUnitPath,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(
        and(
          eq(groupMemberships.memberId, memberId),
          eq(groupMemberships.orgId, orgId),
        ),
      );
    for (const row of rows) {
      if (groupCategoryIds.has(row.categoryId)) {
        // Last write wins per category (single-selection categories will have exactly one)
        groupByCategoryId.set(row.categoryId, {
          name: row.name,
          workspaceOrgUnitPath: row.workspaceOrgUnitPath,
        });
      }
    }
  }

  // Resolve each field
  for (const config of enabledConfigs) {
    const source = config.source;
    if (!source || source.type === "manual") continue;

    if (source.type === "member_custom_field") {
      const val = customFieldsByKey.get(source.customFieldKey);
      if (val !== undefined && val !== "") result[config.fieldKey] = val;
    } else if (source.type === "group_category") {
      const grp = groupByCategoryId.get(source.categoryId);
      if (grp) {
        const formatted = applyFormatTemplate(source.formatTemplate, grp.name);
        if (formatted) result[config.fieldKey] = formatted;
      }
    } else if (source.type === "org_unit_auto") {
      if (orgUnitCategoryId) {
        const grp = groupByCategoryId.get(orgUnitCategoryId);
        if (grp?.workspaceOrgUnitPath) result[config.fieldKey] = grp.workspaceOrgUnitPath;
      }
    }
  }

  return result;
}
