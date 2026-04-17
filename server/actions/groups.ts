"use server";

import { randomUUID } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";

import {
  assignCategoryAdminSchema,
  assignGroupAdminSchema,
  assignGroupMemberSchema,
  assignGroupMembersSchema,
  groupCategorySchema,
  groupSchema,
  removeCategoryAdminSchema,
  removeGroupAdminSchema,
  removeGroupMemberSchema,
} from "@/lib/groups";
import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  groupCategories,
  groupMemberships,
  groups,
} from "@/server/db/schema";
import {
  requireCategoryManagementAccess,
  requireGroupManagementAccess,
  requireOrgAdminAccess,
  requireOrganization,
} from "@/server/queries/access";
import { hasGroupCategoryMembersTableColumn } from "@/server/lib/group-category-members-table-column";
import { getGroupCategoryById, getGroupById } from "@/server/queries/groups";
import { getMemberById } from "@/server/queries/members";

async function ensureUniqueCategorySlug(orgId: string, slug: string, categoryId?: string) {
  const conditions = [eq(groupCategories.orgId, orgId), eq(groupCategories.slug, slug)];

  if (categoryId) {
    conditions.push(ne(groupCategories.id, categoryId));
  }

  const [existing] = await db
    .select({ id: groupCategories.id })
    .from(groupCategories)
    .where(and(...conditions))
    .limit(1);

  return existing == null;
}

async function ensureUniqueGroupSlug(orgId: string, slug: string, groupId?: string) {
  const conditions = [eq(groups.orgId, orgId), eq(groups.slug, slug)];

  if (groupId) {
    conditions.push(ne(groups.id, groupId));
  }

  const [existing] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(...conditions))
    .limit(1);

  return existing == null;
}

async function requireOrgMemberInOrganization(orgId: string, memberId: string) {
  const member = await getMemberById(orgId, memberId);

  if (!member) {
    throw new Error("The selected member could not be found.");
  }

  return member;
}

export const saveGroupCategoryAction = orgAdminActionClient
  .metadata({ actionName: "saveGroupCategory" })
  .inputSchema(groupCategorySchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const hasMembersTableColumn = await hasGroupCategoryMembersTableColumn();
    const isUnique = await ensureUniqueCategorySlug(
      organization.id,
      parsedInput.slug,
      parsedInput.id,
    );

    if (!isUnique) {
      returnValidationErrors(groupCategorySchema, {
        slug: {
          _errors: ["That category slug is already in use."],
        },
      });
    }

    if (parsedInput.id) {
      const existing = await getGroupCategoryById(organization.id, parsedInput.id);

      if (!existing) {
        throw new Error("The selected category could not be found.");
      }

      const categoryWhere = and(
        eq(groupCategories.id, parsedInput.id),
        eq(groupCategories.orgId, organization.id),
      );

      if (hasMembersTableColumn) {
        await db
          .update(groupCategories)
          .set({
            name: parsedInput.name.trim(),
            slug: parsedInput.slug.trim(),
            description: parsedInput.description,
            registrationFieldLabel: parsedInput.showInRegistration
              ? parsedInput.registrationFieldLabel
              : null,
            isActive: parsedInput.isActive,
            isPinnedToNavigation: parsedInput.isPinnedToNavigation,
            showInRegistration: parsedInput.showInRegistration,
            showInMembersTable: parsedInput.showInMembersTable,
            selectionMode: parsedInput.selectionMode,
            selectionRequired: parsedInput.selectionRequired,
            maxSelections: parsedInput.maxSelections,
            defaultJoinPolicy: parsedInput.defaultJoinPolicy,
            sortOrder: parsedInput.sortOrder,
            updatedAt: new Date(),
          })
          .where(categoryWhere);
      } else {
        await db
          .update(groupCategories)
          .set({
            name: parsedInput.name.trim(),
            slug: parsedInput.slug.trim(),
            description: parsedInput.description,
            registrationFieldLabel: parsedInput.showInRegistration
              ? parsedInput.registrationFieldLabel
              : null,
            isActive: parsedInput.isActive,
            isPinnedToNavigation: parsedInput.isPinnedToNavigation,
            showInRegistration: parsedInput.showInRegistration,
            selectionMode: parsedInput.selectionMode,
            selectionRequired: parsedInput.selectionRequired,
            maxSelections: parsedInput.maxSelections,
            defaultJoinPolicy: parsedInput.defaultJoinPolicy,
            sortOrder: parsedInput.sortOrder,
            updatedAt: new Date(),
          })
          .where(categoryWhere);
      }
    } else {
      if (hasMembersTableColumn) {
        await db.insert(groupCategories).values({
          id: randomUUID(),
          orgId: organization.id,
          name: parsedInput.name.trim(),
          slug: parsedInput.slug.trim(),
          description: parsedInput.description,
          registrationFieldLabel: parsedInput.showInRegistration
            ? parsedInput.registrationFieldLabel
            : null,
          isActive: parsedInput.isActive,
          isPinnedToNavigation: parsedInput.isPinnedToNavigation,
          showInRegistration: parsedInput.showInRegistration,
          showInMembersTable: parsedInput.showInMembersTable,
          selectionMode: parsedInput.selectionMode,
          selectionRequired: parsedInput.selectionRequired,
          maxSelections: parsedInput.maxSelections,
          defaultJoinPolicy: parsedInput.defaultJoinPolicy,
          sortOrder: parsedInput.sortOrder,
        });
      } else {
        await db.insert(groupCategories).values({
          id: randomUUID(),
          orgId: organization.id,
          name: parsedInput.name.trim(),
          slug: parsedInput.slug.trim(),
          description: parsedInput.description,
          registrationFieldLabel: parsedInput.showInRegistration
            ? parsedInput.registrationFieldLabel
            : null,
          isActive: parsedInput.isActive,
          isPinnedToNavigation: parsedInput.isPinnedToNavigation,
          showInRegistration: parsedInput.showInRegistration,
          selectionMode: parsedInput.selectionMode,
          selectionRequired: parsedInput.selectionRequired,
          maxSelections: parsedInput.maxSelections,
          defaultJoinPolicy: parsedInput.defaultJoinPolicy,
          sortOrder: parsedInput.sortOrder,
        });
      }
    }

    return { success: true };
  });

export const saveGroupAction = authActionClient
  .metadata({ actionName: "saveGroup" })
  .inputSchema(groupSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const isUnique = await ensureUniqueGroupSlug(organization.id, parsedInput.slug, parsedInput.id);

    if (!isUnique) {
      returnValidationErrors(groupSchema, {
        slug: {
          _errors: ["That group slug is already in use."],
        },
      });
    }

    if (parsedInput.id) {
      const existing = await getGroupById(organization.id, parsedInput.id);

      if (!existing) {
        throw new Error("The selected group could not be found.");
      }

      await requireGroupManagementAccess(parsedInput.id);

      await db
        .update(groups)
        .set({
          name: parsedInput.name.trim(),
          slug: parsedInput.slug.trim(),
          description: parsedInput.description,
          joinPolicy: parsedInput.joinPolicy,
          isActive: parsedInput.isActive,
          sortOrder: parsedInput.sortOrder,
          updatedAt: new Date(),
        })
        .where(and(eq(groups.id, parsedInput.id), eq(groups.orgId, organization.id)));
    } else {
      await requireCategoryManagementAccess(parsedInput.categoryId);

      const category = await getGroupCategoryById(organization.id, parsedInput.categoryId);

      if (!category) {
        throw new Error("The selected category could not be found.");
      }

      await db.insert(groups).values({
        id: randomUUID(),
        orgId: organization.id,
        categoryId: parsedInput.categoryId,
        name: parsedInput.name.trim(),
        slug: parsedInput.slug.trim(),
        description: parsedInput.description,
        joinPolicy: parsedInput.joinPolicy,
        isActive: parsedInput.isActive,
        sortOrder: parsedInput.sortOrder,
      });
    }

    return { success: true };
  });

export const assignCategoryAdminAction = orgAdminActionClient
  .metadata({ actionName: "assignCategoryAdmin" })
  .inputSchema(assignCategoryAdminSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const category = await getGroupCategoryById(organization.id, parsedInput.categoryId);

    if (!category) {
      throw new Error("The selected category could not be found.");
    }

    await requireOrgMemberInOrganization(organization.id, parsedInput.memberId);

    await db
      .insert(categoryAdminAssignments)
      .values({
        id: randomUUID(),
        orgId: organization.id,
        categoryId: parsedInput.categoryId,
        memberId: parsedInput.memberId,
      })
      .onConflictDoNothing();

    return { success: true };
  });

export const removeCategoryAdminAction = orgAdminActionClient
  .metadata({ actionName: "removeCategoryAdmin" })
  .inputSchema(removeCategoryAdminSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    await db
      .delete(categoryAdminAssignments)
      .where(
        and(
          eq(categoryAdminAssignments.orgId, organization.id),
          eq(categoryAdminAssignments.categoryId, parsedInput.categoryId),
          eq(categoryAdminAssignments.memberId, parsedInput.memberId),
        ),
      );

    return { success: true };
  });

export const assignGroupMemberAction = authActionClient
  .metadata({ actionName: "assignGroupMember" })
  .inputSchema(assignGroupMemberSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const group = await getGroupById(organization.id, parsedInput.groupId);

    if (!group) {
      throw new Error("The selected group could not be found.");
    }

    await requireGroupManagementAccess(parsedInput.groupId);
    await requireOrgMemberInOrganization(organization.id, parsedInput.memberId);

    await db
      .insert(groupMemberships)
      .values({
        id: randomUUID(),
        orgId: organization.id,
        groupId: parsedInput.groupId,
        memberId: parsedInput.memberId,
        role: "member",
      })
      .onConflictDoNothing();

    return { success: true };
  });

export const assignGroupMembersAction = authActionClient
  .metadata({ actionName: "assignGroupMembers" })
  .inputSchema(assignGroupMembersSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const group = await getGroupById(organization.id, parsedInput.groupId);

    if (!group) {
      throw new Error("The selected group could not be found.");
    }

    await requireGroupManagementAccess(parsedInput.groupId);

    const uniqueMemberIds = [...new Set(parsedInput.memberIds)];

    for (const memberId of uniqueMemberIds) {
      await requireOrgMemberInOrganization(organization.id, memberId);
    }

    await db
      .insert(groupMemberships)
      .values(
        uniqueMemberIds.map((memberId) => ({
          id: randomUUID(),
          orgId: organization.id,
          groupId: parsedInput.groupId,
          memberId,
          role: "member" as const,
        })),
      )
      .onConflictDoNothing();

    return {
      success: true,
      requestedCount: uniqueMemberIds.length,
    };
  });

export const removeGroupMemberAction = authActionClient
  .metadata({ actionName: "removeGroupMember" })
  .inputSchema(removeGroupMemberSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    await requireGroupManagementAccess(parsedInput.groupId);

    await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.orgId, organization.id),
          eq(groupMemberships.groupId, parsedInput.groupId),
          eq(groupMemberships.memberId, parsedInput.memberId),
        ),
      );

    return { success: true };
  });

export const assignGroupAdminAction = authActionClient
  .metadata({ actionName: "assignGroupAdmin" })
  .inputSchema(assignGroupAdminSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    await requireGroupManagementAccess(parsedInput.groupId);
    await requireOrgMemberInOrganization(organization.id, parsedInput.memberId);

    const [existing] = await db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.orgId, organization.id),
          eq(groupMemberships.groupId, parsedInput.groupId),
          eq(groupMemberships.memberId, parsedInput.memberId),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(groupMemberships)
        .set({
          role: "group_admin",
          updatedAt: new Date(),
        })
        .where(eq(groupMemberships.id, existing.id));
    } else {
      await db.insert(groupMemberships).values({
        id: randomUUID(),
        orgId: organization.id,
        groupId: parsedInput.groupId,
        memberId: parsedInput.memberId,
        role: "group_admin",
      });
    }

    return { success: true };
  });

export const removeGroupAdminAction = authActionClient
  .metadata({ actionName: "removeGroupAdmin" })
  .inputSchema(removeGroupAdminSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    await requireGroupManagementAccess(parsedInput.groupId);

    await db
      .update(groupMemberships)
      .set({
        role: "member",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMemberships.orgId, organization.id),
          eq(groupMemberships.groupId, parsedInput.groupId),
          eq(groupMemberships.memberId, parsedInput.memberId),
        ),
      );

    return { success: true };
  });
