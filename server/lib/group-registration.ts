import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { groupCategories, groupMemberships, groups } from "@/server/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RegistrationGroupCategory = {
  id: string;
  name: string;
  registrationFieldLabel: string | null;
  description: string | null;
  selectionRequired: boolean;
  groups: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

export async function validateRegistrationGroupSelections({
  categories,
  selections,
}: {
  categories: RegistrationGroupCategory[];
  selections: Record<string, string | null | undefined>;
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const errors: Record<string, string[]> = {};
  const normalizedSelections: Array<{ categoryId: string; groupId: string }> = [];

  for (const category of categories) {
    const selectedGroupId = selections[category.id] ?? null;

    if (!selectedGroupId) {
      if (category.selectionRequired) {
        errors[category.id] =
          category.groups.length === 0
            ? ["No groups are currently available in this category."]
            : ["Choose a group for this category."];
      }
      continue;
    }

    const validGroup = category.groups.find((group) => group.id === selectedGroupId);

    if (!validGroup) {
      errors[category.id] = ["Choose a valid group from this category."];
      continue;
    }

    normalizedSelections.push({
      categoryId: category.id,
      groupId: selectedGroupId,
    });
  }

  for (const categoryId of Object.keys(selections)) {
    if (!categoryById.has(categoryId)) {
      errors[categoryId] = ["This registration category is no longer available."];
    }
  }

  return {
    errors,
    normalizedSelections,
  };
}

export async function syncRegistrationGroupSelections(tx: DbTransaction, {
  orgId,
  memberId,
  registrationCategoryIds,
  selections,
}: {
  orgId: string;
  memberId: string;
  registrationCategoryIds: string[];
  selections: Array<{ categoryId: string; groupId: string }>;
}) {
  if (registrationCategoryIds.length > 0) {
    const categoryGroups = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.orgId, orgId), inArray(groups.categoryId, registrationCategoryIds)));

    const groupIds = categoryGroups.map((group) => group.id);

    if (groupIds.length > 0) {
      await tx
        .delete(groupMemberships)
        .where(
          and(
            eq(groupMemberships.orgId, orgId),
            eq(groupMemberships.memberId, memberId),
            eq(groupMemberships.role, "member"),
            inArray(groupMemberships.groupId, groupIds),
          ),
        );
    }
  }

  for (const selection of selections) {
    await tx
      .insert(groupMemberships)
      .values({
        id: crypto.randomUUID(),
        orgId,
        groupId: selection.groupId,
        memberId,
        role: "member",
      })
      .onConflictDoNothing();
  }
}

export async function listRegistrationGroupCategories(orgId: string): Promise<RegistrationGroupCategory[]> {
  const [categories, categoryGroups] = await Promise.all([
    db
      .select({
        id: groupCategories.id,
        name: groupCategories.name,
        registrationFieldLabel: groupCategories.registrationFieldLabel,
        description: groupCategories.description,
        selectionRequired: groupCategories.selectionRequired,
        sortOrder: groupCategories.sortOrder,
      })
      .from(groupCategories)
      .where(
        and(
          eq(groupCategories.orgId, orgId),
          eq(groupCategories.isActive, true),
          eq(groupCategories.showInRegistration, true),
        ),
      ),
      db
      .select({
        id: groups.id,
        categoryId: groups.categoryId,
        name: groups.name,
        description: groups.description,
        sortOrder: groups.sortOrder,
      })
      .from(groups)
      .where(and(eq(groups.orgId, orgId), eq(groups.isActive, true))),
  ]);

  return categories
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      registrationFieldLabel: category.registrationFieldLabel,
      description: category.description,
      selectionRequired: category.selectionRequired,
      groups: categoryGroups
        .filter((group) => group.categoryId === category.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description,
        })),
    }));
}
