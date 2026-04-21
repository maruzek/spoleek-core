import { and, asc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";

import {
  buildMemberCustomFieldDisplayItems,
  extractAnswerValue,
} from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberCustomFields,
  memberCustomFieldValues,
  memberInvites,
  organizations as organizationsTable,
  tenantMembers,
  users,
  type MemberInviteDeliveryStatus,
  type MemberInviteStatus,
} from "@/server/db/schema";
import { hasGroupCategoryMembersTableColumn } from "@/server/lib/group-category-members-table-column";
import type {
  MemberManagementGroupCategory,
  MemberManagementScope,
} from "@/server/lib/member-management-scope";
import {
  canAccessMemberInScope,
  resolveMemberManagementScope,
} from "@/server/lib/member-management-scope";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getMemberCustomFieldAnswerMap } from "@/server/queries/member-custom-fields";

export type MemberGroupAssignment = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  role: "member" | "group_admin";
  assignedAt: Date;
};

export type MemberCustomFieldDisplay = {
  key: string;
  label: string;
  displayValue: string;
};

export type MemberInviteState = {
  status: MemberInviteStatus | null;
  deliveryStatus: MemberInviteDeliveryStatus | null;
  lastError: string | null;
};

export type MemberTimelineEvent = {
  id: string;
  title: string;
  description: string;
  date: Date;
  tone: "default" | "success" | "warning" | "info";
};

export type MemberEditorMetadata = {
  linkedUserName: string | null;
  primaryGroup: MemberGroupAssignment | null;
  groupAssignments: MemberGroupAssignment[];
  customFieldDetails: MemberCustomFieldDisplay[];
  inviteState: MemberInviteState;
  memberTimeline: MemberTimelineEvent[];
};

export type MemberEditorData = {
  member: typeof tenantMembers.$inferSelect;
  customFieldAnswers: Record<string, unknown>;
  metadata: MemberEditorMetadata;
};

export type MembersTableCategory = {
  id: string;
  name: string;
  slug: string;
};

export type MemberAdminAccess = {
  level: MemberManagementScope["accessLevel"];
  canAssignElevatedRoles: boolean;
  roleOptions: MemberManagementScope["roleOptions"];
  description: string;
};

export type WorkspaceModuleState = {
  enabled: boolean;
  connected: boolean;
  domain: string | null;
  emailTemplate: string;
};

export type MembersAdminPageData = {
  access: MemberAdminAccess;
  members: Awaited<ReturnType<typeof listTenantMembers>>;
  customFields: Awaited<ReturnType<typeof listMemberCustomFields>>;
  memberCategories: MembersTableCategory[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  selectedMember: MemberEditorData | null;
  workspace: WorkspaceModuleState;
};

type MemberInviteRow = {
  status: MemberInviteStatus | null;
  deliveryStatus: MemberInviteDeliveryStatus | null;
  sentAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
};

function toInviteState(invite: MemberInviteRow | null): MemberInviteState {
  return {
    status: invite?.status ?? null,
    deliveryStatus: invite?.deliveryStatus ?? null,
    lastError: invite?.lastError ?? null,
  };
}

function sortGroupAssignments(assignments: MemberGroupAssignment[]) {
  return [...assignments].sort((left, right) => {
    const leftWeight = left.role === "group_admin" ? 0 : 1;
    const rightWeight = right.role === "group_admin" ? 0 : 1;

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.assignedAt.getTime() - right.assignedAt.getTime();
  });
}

function getPrimaryGroup(assignments: MemberGroupAssignment[]) {
  return sortGroupAssignments(assignments)[0] ?? null;
}

function buildMemberTimeline(args: {
  member: typeof tenantMembers.$inferSelect;
  invite: MemberInviteRow | null;
  primaryGroup: MemberGroupAssignment | null;
}) {
  const { member, invite, primaryGroup } = args;
  const events: MemberTimelineEvent[] = [
    {
      id: "member-created",
      title: "Member record created",
      description:
        member.userId == null
          ? "Created as a shadow profile inside the organization."
          : "Created as a linked membership record.",
      date: member.createdAt,
      tone: "default",
    },
  ];

  if (invite?.sentAt) {
    events.push({
      id: "invite-sent",
      title: "Activation invite sent",
      description:
        invite.deliveryStatus && invite.deliveryStatus !== "pending"
          ? `Delivery ${invite.deliveryStatus.replace("_", " ")}.`
          : "Approval email was sent to the member.",
      date: invite.sentAt,
      tone:
        invite.deliveryStatus === "bounced" ||
        invite.deliveryStatus === "complained" ||
        invite.deliveryStatus === "suppressed" ||
        invite.status === "failed"
          ? "warning"
          : "info",
    });
  }

  if (invite?.completedAt) {
    events.push({
      id: "invite-completed",
      title: "Activation completed",
      description: "The invite flow was completed successfully.",
      date: invite.completedAt,
      tone: "success",
    });
  }

  if (member.linkedAt) {
    events.push({
      id: "member-linked",
      title: "Linked to a user account",
      description: "This membership now points to a real authenticated user.",
      date: member.linkedAt,
      tone: "success",
    });
  }

  if (member.acceptedTermsAt) {
    events.push({
      id: "accepted-terms",
      title: "Terms accepted",
      description: "The member accepted the organization terms of service.",
      date: member.acceptedTermsAt,
      tone: "success",
    });
  }

  if (member.acceptedPrivacyAt) {
    events.push({
      id: "accepted-privacy",
      title: "Privacy policy accepted",
      description: "The member accepted the organization privacy policy.",
      date: member.acceptedPrivacyAt,
      tone: "success",
    });
  }

  if (primaryGroup) {
    events.push({
      id: `primary-group-${primaryGroup.id}`,
      title: "Joined primary group",
      description: `${primaryGroup.name} (${primaryGroup.categoryName})${
        primaryGroup.role === "group_admin" ? " as group admin." : "."
      }`,
      date: primaryGroup.assignedAt,
      tone: "info",
    });
  }

  return events.sort((left, right) => left.date.getTime() - right.date.getTime());
}

async function listMemberGroupAssignments(
  orgId: string,
  options?: {
    memberIds?: string[];
    visibleGroupIds?: string[] | null;
  },
) {
  const filters = [
    eq(groupMemberships.orgId, orgId),
    eq(groups.isActive, true),
    eq(groupCategories.isActive, true),
  ];

  if (options?.memberIds && options.memberIds.length > 0) {
    filters.push(inArray(groupMemberships.memberId, options.memberIds));
  }

  if (options?.visibleGroupIds) {
    if (options.visibleGroupIds.length === 0) {
      return new Map<string, MemberGroupAssignment[]>();
    }

    filters.push(inArray(groupMemberships.groupId, options.visibleGroupIds));
  }

  const rows = await db
    .select({
      memberId: groupMemberships.memberId,
      id: groups.id,
      name: groups.name,
      categoryId: groupCategories.id,
      categoryName: groupCategories.name,
      role: groupMemberships.role,
      assignedAt: groupMemberships.createdAt,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(and(...filters))
    .orderBy(asc(groupMemberships.createdAt), asc(groups.name));

  return rows.reduce<Map<string, MemberGroupAssignment[]>>((map, row) => {
    const assignments = map.get(row.memberId) ?? [];
    assignments.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      role: row.role,
      assignedAt: row.assignedAt,
    });
    map.set(row.memberId, assignments);
    return map;
  }, new Map());
}

async function listMemberCustomFieldDisplayMap(orgId: string, memberIds?: string[]) {
  const valueFilters = [eq(memberCustomFieldValues.orgId, orgId)];

  if (memberIds && memberIds.length > 0) {
    valueFilters.push(inArray(memberCustomFieldValues.memberId, memberIds));
  }

  const [fields, valueRows] = await Promise.all([
    db
      .select({
        id: memberCustomFields.id,
        key: memberCustomFields.key,
        label: memberCustomFields.label,
        type: memberCustomFields.type,
      })
      .from(memberCustomFields)
      .where(eq(memberCustomFields.orgId, orgId))
      .orderBy(
        asc(memberCustomFields.sortOrder),
        asc(memberCustomFields.label),
        asc(memberCustomFields.createdAt),
      ),
    db
      .select({
        memberId: memberCustomFieldValues.memberId,
        fieldId: memberCustomFieldValues.fieldId,
        valueText: memberCustomFieldValues.valueText,
        valueNumber: memberCustomFieldValues.valueNumber,
        valueBoolean: memberCustomFieldValues.valueBoolean,
        valueDate: memberCustomFieldValues.valueDate,
        valueJson: memberCustomFieldValues.valueJson,
      })
      .from(memberCustomFieldValues)
      .where(and(...valueFilters)),
  ]);

  const answersByMember = valueRows.reduce<Map<string, Record<string, unknown>>>(
    (map, row) => {
      const answers = map.get(row.memberId) ?? {};
      answers[row.fieldId] = extractAnswerValue({
        valueText: row.valueText,
        valueNumber: row.valueNumber,
        valueBoolean: row.valueBoolean,
        valueDate: row.valueDate,
        valueJson: Array.isArray(row.valueJson)
          ? row.valueJson.map(String)
          : null,
      });
      map.set(row.memberId, answers);
      return map;
    },
    new Map(),
  );

  return new Map(
    Array.from(answersByMember.entries()).map(([memberId, answersByFieldId]) => [
      memberId,
      buildMemberCustomFieldDisplayItems(
        fields,
        Object.fromEntries(fields.map((field) => [field.key, answersByFieldId[field.id] ?? null])),
      ),
    ]),
  );
}

async function getMemberInviteRow(memberId: string) {
  const [invite] = await db
    .select({
      status: memberInvites.status,
      deliveryStatus: memberInvites.deliveryStatus,
      sentAt: memberInvites.sentAt,
      completedAt: memberInvites.completedAt,
      lastError: memberInvites.lastError,
    })
    .from(memberInvites)
    .where(eq(memberInvites.memberId, memberId))
    .limit(1);

  return invite ?? null;
}

async function listVisibleScopedMemberIds(orgId: string, visibleGroupIds: string[]) {
  if (visibleGroupIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ memberId: groupMemberships.memberId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        inArray(groupMemberships.groupId, visibleGroupIds),
      ),
    );

  return [...new Set(rows.map((row) => row.memberId))];
}

export async function listMembersTableCategories(
  orgId: string,
  options?: { visibleCategoryIds?: string[] | null },
) {
  const hasColumn = await hasGroupCategoryMembersTableColumn();

  if (!hasColumn) {
    return [];
  }

  if (options?.visibleCategoryIds?.length === 0) {
    return [];
  }

  return db
    .select({
      id: groupCategories.id,
      name: groupCategories.name,
      slug: groupCategories.slug,
    })
    .from(groupCategories)
    .where(
      and(
        eq(groupCategories.orgId, orgId),
        eq(groupCategories.showInMembersTable, true),
        eq(groupCategories.isActive, true),
        options?.visibleCategoryIds
          ? inArray(groupCategories.id, options.visibleCategoryIds)
          : undefined,
      ),
    )
    .orderBy(asc(groupCategories.sortOrder), asc(groupCategories.name));
}

export async function listManageableGroupCategories(
  _orgId: string,
  scope: MemberManagementScope,
) {
  return scope.manageableGroupCategories;
}

export async function getTenantMemberByUserId(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.userId, userId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function findShadowMemberForUser(orgId: string, email: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        isNull(tenantMembers.userId),
        ilike(tenantMembers.email, email),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function findTenantMemberByEmail(orgId: string, email: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        ilike(tenantMembers.email, email),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function listTenantMembers(
  orgId: string,
  options?: {
    visibleGroupIds?: string[] | null;
  },
) {
  const visibleGroupIds = options?.visibleGroupIds;
  const visibleMemberIds =
    visibleGroupIds == null ? null : await listVisibleScopedMemberIds(orgId, visibleGroupIds);

  if (visibleMemberIds && visibleMemberIds.length === 0) {
    return [];
  }

  const [members, groupAssignmentsByMember, customFieldDisplayByMember] = await Promise.all([
    db
      .select({
        id: tenantMembers.id,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        role: tenantMembers.role,
        status: tenantMembers.status,
        userId: tenantMembers.userId,
        workspaceUserEmail: tenantMembers.workspaceUserEmail,
        workspaceUserId: tenantMembers.workspaceUserId,
        preferredEmail: tenantMembers.preferredEmail,
        createdAt: tenantMembers.createdAt,
        linkedUserName: users.name,
        inviteStatus: memberInvites.status,
        inviteDeliveryStatus: memberInvites.deliveryStatus,
        inviteLastError: memberInvites.lastError,
      })
      .from(tenantMembers)
      .leftJoin(users, eq(users.id, tenantMembers.userId))
      .leftJoin(memberInvites, eq(memberInvites.memberId, tenantMembers.id))
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          ne(tenantMembers.status, "deleted"),
          visibleMemberIds ? inArray(tenantMembers.id, visibleMemberIds) : undefined,
        ),
      )
      .orderBy(asc(tenantMembers.createdAt)),
    listMemberGroupAssignments(orgId, {
      memberIds: visibleMemberIds ?? undefined,
      visibleGroupIds,
    }),
    listMemberCustomFieldDisplayMap(orgId, visibleMemberIds ?? undefined),
  ]);

  return members.map((member) => {
    const groupAssignments = groupAssignmentsByMember.get(member.id) ?? [];
    const customFieldDetails = customFieldDisplayByMember.get(member.id) ?? [];
    const groupAssignmentsByCategory = Object.fromEntries(
      groupAssignments.reduce<Map<string, MemberGroupAssignment[]>>((map, assignment) => {
        const assignments = map.get(assignment.categoryId) ?? [];
        assignments.push(assignment);
        map.set(assignment.categoryId, assignments);
        return map;
      }, new Map()),
    );
    const customFieldValues = Object.fromEntries(
      customFieldDetails.map((item) => [item.key, item.displayValue]),
    );

    return {
      ...member,
      primaryGroup: getPrimaryGroup(groupAssignments),
      customFieldHighlights: customFieldDetails,
      customFieldValues,
      groupAssignmentsByCategory,
      inviteState: {
        status: member.inviteStatus,
        deliveryStatus: member.inviteDeliveryStatus,
        lastError: member.inviteLastError,
      },
    };
  });
}

export async function getMemberById(orgId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.id, memberId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function getMemberByUserId(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.userId, userId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function getMemberEditorData(
  orgId: string,
  memberId: string,
  options?: {
    visibleGroupIds?: string[] | null;
  },
) {
  const member = await getMemberById(orgId, memberId);

  if (!member) {
    return null;
  }

  if (options?.visibleGroupIds) {
    const canAccess = await canAccessMemberInScope(
      orgId,
      memberId,
      {
        accessLevel: "scoped",
        managedGroupIds: options.visibleGroupIds,
      },
    );

    if (!canAccess) {
      return null;
    }
  }

  const [customFieldAnswers, groupAssignmentsByMember, customFieldDisplayByMember, invite, linkedUser] =
    await Promise.all([
      getMemberCustomFieldAnswerMap(orgId, member.id),
      listMemberGroupAssignments(orgId, {
        memberIds: [member.id],
        visibleGroupIds: options?.visibleGroupIds,
      }),
      listMemberCustomFieldDisplayMap(orgId, [member.id]),
      getMemberInviteRow(member.id),
      member.userId ? findUserById(member.userId) : Promise.resolve(null),
    ]);

  const groupAssignments = sortGroupAssignments(
    groupAssignmentsByMember.get(member.id) ?? [],
  );
  const primaryGroup = getPrimaryGroup(groupAssignments);
  const customFieldDetails = customFieldDisplayByMember.get(member.id) ?? [];
  const inviteState = toInviteState(invite);

  return {
    member,
    customFieldAnswers,
    metadata: {
      linkedUserName: linkedUser?.name ?? null,
      primaryGroup,
      groupAssignments,
      customFieldDetails,
      inviteState,
      memberTimeline: buildMemberTimeline({
        member,
        invite,
        primaryGroup,
      }),
    },
  };
}

async function findUserById(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), ilike(users.email, email)))
    .limit(1);

  return user ?? null;
}

export async function getMembersByIds(orgId: string, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        inArray(tenantMembers.id, memberIds),
        ne(tenantMembers.status, "deleted"),
      ),
    );
}

export async function getMembersAdminPageData(editMemberId: string | null) {
  const scope = await resolveMemberManagementScope();

  const [members, customFields, memberCategories, manageableGroupCategories, selectedMember, organization] =
    await Promise.all([
      listTenantMembers(scope.organizationId, {
        visibleGroupIds: scope.managedGroupIds,
      }),
      listMemberCustomFields(scope.organizationId),
      listMembersTableCategories(scope.organizationId, {
        visibleCategoryIds: scope.managedCategoryIds,
      }),
      listManageableGroupCategories(scope.organizationId, scope),
      editMemberId
        ? getMemberEditorData(scope.organizationId, editMemberId, {
            visibleGroupIds: scope.managedGroupIds,
          })
        : Promise.resolve(null),
      db
        .select({
          workspaceModuleEnabled: organizationsTable.workspaceModuleEnabled,
          workspaceConnectedAt: organizationsTable.workspaceConnectedAt,
          workspaceDomain: organizationsTable.workspaceDomain,
          workspaceEmailTemplate: organizationsTable.workspaceEmailTemplate,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, scope.organizationId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

  return {
    access: {
      level: scope.accessLevel,
      canAssignElevatedRoles: scope.canAssignElevatedRoles,
      roleOptions: scope.roleOptions,
      description: scope.description,
    },
    members,
    customFields,
    memberCategories,
    manageableGroupCategories,
    selectedMember,
    workspace: {
      enabled: Boolean(organization?.workspaceModuleEnabled),
      connected: Boolean(organization?.workspaceConnectedAt),
      domain: organization?.workspaceDomain ?? null,
      emailTemplate:
        organization?.workspaceEmailTemplate ?? "{first}.{last}",
    },
  } satisfies MembersAdminPageData;
}
