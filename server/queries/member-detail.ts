import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupWorkspaceLinks,
  groups,
  memberAuthEvents,
  users,
  workspaceGroupMemberLinks,
  type MemberAuthEventType,
  type MemberCustomField,
  type MemberPayment,
} from "@/server/db/schema";
import {
  getOrganizationEmailActivityDetail,
  listMemberEmailActivities,
  type EmailActivityDetail,
  type EmailActivityRow,
} from "@/server/queries/email-activity";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";
import {
  getMemberEditorData,
  getWorkspaceModuleState,
  type MemberAdminAccess,
  type MemberEditorData,
  type WorkspaceModuleState,
} from "@/server/queries/members";
import { listPaymentsForMember } from "@/server/queries/payments";
import { getMemberAgeSignal, type MemberAgeSignal } from "@/server/lib/member-age";
import {
  resolveMemberManagementScope,
  type MemberManagementGroupCategory,
} from "@/server/lib/member-management-scope";

export type MemberAuthEventRow = {
  id: string;
  eventType: MemberAuthEventType;
  message: string | null;
  actorName: string | null;
  createdAt: Date;
};

/** One Google group this member is actually a member of, via a synced link. */
export type MemberWorkspaceGroupLink = {
  id: string;
  address: string;
  groupName: string | null;
  workspaceGroupName: string | null;
  lastSyncStatus: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
};

export type MemberPaymentSummary = {
  currency: string | null;
  paidCents: number;
  outstandingCents: number;
  overdueCount: number;
  nextDueAt: Date | null;
};

export type MemberDetailData = {
  access: MemberAdminAccess;
  editor: MemberEditorData;
  ageSignal: MemberAgeSignal | null;
  customFields: MemberCustomField[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  workspace: WorkspaceModuleState;
  payments: MemberPayment[];
  paymentSummary: MemberPaymentSummary;
  emails: EmailActivityRow[];
  selectedEmail: EmailActivityDetail | null;
  authEvents: MemberAuthEventRow[];
  workspaceGroupLinks: MemberWorkspaceGroupLink[];
};

async function listMemberAuthEvents(
  orgId: string,
  memberId: string,
): Promise<MemberAuthEventRow[]> {
  const rows = await db
    .select({
      id: memberAuthEvents.id,
      eventType: memberAuthEvents.eventType,
      message: memberAuthEvents.message,
      createdAt: memberAuthEvents.createdAt,
      actorName: users.name,
    })
    .from(memberAuthEvents)
    .leftJoin(users, eq(users.id, memberAuthEvents.actorUserId))
    .where(
      and(
        eq(memberAuthEvents.orgId, orgId),
        eq(memberAuthEvents.memberId, memberId),
      ),
    )
    .orderBy(desc(memberAuthEvents.createdAt));

  return rows;
}

async function listMemberWorkspaceGroupLinks(
  orgId: string,
  memberId: string,
): Promise<MemberWorkspaceGroupLink[]> {
  return db
    .select({
      id: workspaceGroupMemberLinks.id,
      address: workspaceGroupMemberLinks.address,
      groupName: groups.name,
      workspaceGroupName: groupWorkspaceLinks.workspaceGroupName,
      lastSyncStatus: groupWorkspaceLinks.lastSyncStatus,
      lastSyncedAt: groupWorkspaceLinks.lastSyncedAt,
      createdAt: workspaceGroupMemberLinks.createdAt,
    })
    .from(workspaceGroupMemberLinks)
    .innerJoin(
      groupWorkspaceLinks,
      eq(groupWorkspaceLinks.id, workspaceGroupMemberLinks.linkId),
    )
    .leftJoin(groups, eq(groups.id, groupWorkspaceLinks.groupId))
    .where(
      and(
        eq(workspaceGroupMemberLinks.orgId, orgId),
        eq(workspaceGroupMemberLinks.memberId, memberId),
      ),
    )
    .orderBy(desc(workspaceGroupMemberLinks.createdAt));
}

/**
 * Money is summarised on the server so the header can show a single number
 * without the client re-deriving it from the full payment list.
 */
function summarisePayments(payments: MemberPayment[]): MemberPaymentSummary {
  let paidCents = 0;
  let outstandingCents = 0;
  let overdueCount = 0;
  let nextDueAt: Date | null = null;
  let currency: string | null = null;

  for (const payment of payments) {
    currency ??= payment.currency;

    if (payment.status === "paid") {
      paidCents += payment.amount;
      continue;
    }

    if (payment.status === "cancelled") {
      continue;
    }

    outstandingCents += payment.amount;

    if (payment.status === "overdue") {
      overdueCount += 1;
    }

    if (nextDueAt === null || payment.dueAt < nextDueAt) {
      nextDueAt = payment.dueAt;
    }
  }

  return { currency, paidCents, outstandingCents, overdueCount, nextDueAt };
}

/**
 * Everything the member detail route renders, in one scoped fetch.
 *
 * Returns `null` when the member does not exist or falls outside the viewer's
 * management scope, so the route can render a 404 without leaking whether the
 * id belongs to another org.
 */
export async function getMemberDetailData(
  memberId: string,
  options?: { selectedEmailId?: string | null },
): Promise<MemberDetailData | null> {
  const scope = await resolveMemberManagementScope();

  const editor = await getMemberEditorData(scope.organizationId, memberId, {
    visibleGroupIds: scope.managedGroupIds,
  });

  if (!editor) {
    return null;
  }

  const [
    customFields,
    workspace,
    payments,
    emails,
    authEvents,
    workspaceGroupLinks,
    selectedEmail,
  ] = await Promise.all([
    listMemberCustomFields(scope.organizationId),
    getWorkspaceModuleState(scope.organizationId),
    listPaymentsForMember(scope.organizationId, memberId),
    listMemberEmailActivities(scope.organizationId, memberId),
    listMemberAuthEvents(scope.organizationId, memberId),
    listMemberWorkspaceGroupLinks(scope.organizationId, memberId),
    options?.selectedEmailId
      ? getOrganizationEmailActivityDetail(
          scope.organizationId,
          options.selectedEmailId,
        )
      : Promise.resolve(null),
  ]);

  return {
    access: {
      level: scope.accessLevel,
      canAssignElevatedRoles: scope.canAssignElevatedRoles,
      roleOptions: scope.roleOptions,
      description: scope.description,
    },
    editor,
    customFields,
    manageableGroupCategories: scope.manageableGroupCategories,
    workspace,
    payments,
    paymentSummary: summarisePayments(payments),
    emails,
    // Guard against a hand-edited `?email=` pointing at another member's mail.
    selectedEmail:
      selectedEmail && selectedEmail.memberId === memberId ? selectedEmail : null,
    authEvents,
    workspaceGroupLinks,
    // Null unless the organization set a minimum age and marked which field
    // holds the birth date — "we were not asked to check" is not the same
    // claim as "this applicant is old enough".
    ageSignal: await getMemberAgeSignal({ orgId: scope.organizationId, memberId }),
  };
}
