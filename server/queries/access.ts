import { cache } from "react";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";

import type {
  AppCapabilities,
  AppShellAdminGroupPin,
  AppShellContext,
} from "@/lib/app-shell";
import {
  canManageGroup,
  canManageOwner,
  canManageCategory,
  canOverseeCategory,
  getAdminAccessLevel,
  getCapabilities,
  isSystemAdmin,
  managesEveryGroup,
  overseenCategoryIds,
  type EventOwner,
  type Viewer,
} from "@/lib/access/viewer";
import { db } from "@/server/db";
import {
  events,
  forms,
  groupCategories,
  groups,
  type Event,
  type EventOwnerType,
  type Organization,
  type TenantMember,
} from "@/server/db/schema";
import { getAppOrganization } from "@/server/queries/app";
import { getPostApprovalCompleteness } from "@/server/queries/member-custom-fields";
import { listOutstandingPolicies } from "@/server/queries/policies";
import { listPinnedGroupCategoriesForSidebar } from "@/server/queries/groups";
import { requireViewer } from "@/server/queries/viewer";
import { EMPTY_PAYMENT_SCOPE, type PaymentScope } from "@/lib/payments/scope";
import { listMemberIdsInGroups } from "@/server/queries/payments";

export type { Viewer } from "@/lib/access/viewer";

/**
 * Every guard here takes the resolved Viewer (CONTEXT.md) and is a thin
 * throwing wrapper over one predicate in `lib/access/viewer.ts`. Pages get
 * their Viewer from `requireViewer()`, actions from `ctx.viewer`; tests build
 * one by hand. Nothing in this file reads `headers()`.
 */

const getOrganization = cache(getAppOrganization);

export async function requireOrganization() {
  const organization = await getOrganization();

  if (!organization) {
    redirect("/setup");
  }

  return organization;
}

/** What every admin guard returns: the Viewer plus its derived access. */
export type AdminAccess = {
  viewer: Viewer;
  organization: Organization;
  member: TenantMember | null;
  /** Platform operator, not just an org admin. Gates provider-wide data. */
  isSystemAdmin: boolean;
  adminAccessLevel: AppShellContext["adminAccessLevel"];
  capabilities: AppCapabilities;
};

function toAdminAccess(viewer: Viewer): AdminAccess {
  return {
    viewer,
    organization: viewer.organization,
    member: viewer.member,
    isSystemAdmin: isSystemAdmin(viewer),
    adminAccessLevel: getAdminAccessLevel(viewer),
    capabilities: getCapabilities(viewer),
  };
}

/** The app-shell context for a Viewer; one per request thanks to `cache`. */
export const buildAppShellContext = cache(async (viewer: Viewer): Promise<AppShellContext> => {
  const { organization, member } = viewer;
  const adminAccessLevel = getAdminAccessLevel(viewer);
  const capabilities = getCapabilities(viewer);
  const navigation = capabilities.canManageGroups
    ? await getAdminGroupPins(viewer)
    : { adminGroupPins: [] };

  return {
    account: {
      name: viewer.user.name,
      email: viewer.user.email,
      avatar: viewer.user.image,
    },
    organization: {
      name: organization.name,
      slug: organization.slug,
      membershipManagementMode: organization.membershipManagementMode,
      defaultEmailPreference: organization.defaultEmailPreference,
      fees: {
        enabled: organization.membershipFeeEnabled,
        renewalMonth: organization.membershipRenewalMonth,
        renewalDay: organization.membershipRenewalDay,
        feeAmount: organization.membershipFeeAmount,
        feeCurrency: organization.membershipFeeCurrency,
        feeBankAccount: organization.membershipFeeBankAccount,
        paymentWindowDays: organization.membershipFeePaymentWindowDays,
      },
      membershipReportEnabled: organization.membershipReportEnabled,
    },
    member: member
      ? {
          id: member.id,
          role: member.role,
          status: member.status,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
        }
      : null,
    adminAccessLevel,
    capabilities,
    visibleSections: [
      ...(capabilities.canAccessPortal ? (["portal"] as const) : []),
      ...(capabilities.canAccessAdmin ? (["admin"] as const) : []),
    ],
    navigation,
  };
});

/** Shell context for the signed-in viewer (layout, landing and login redirects). */
export async function getViewerAppContext() {
  return buildAppShellContext(await requireViewer());
}

async function getAdminGroupPins(viewer: Viewer): Promise<AppShellContext["navigation"]> {
  const rows = await listPinnedGroupCategoriesForSidebar(viewer.organization.id);
  const visibleCategoryIds = overseenCategoryIds(viewer);
  const visibleGroupIds = managesEveryGroup(viewer)
    ? null
    : new Set(viewer.scope.groups.map((group) => group.id));
  const pins = new Map<string, AppShellAdminGroupPin>();

  for (const row of rows) {
    const canSeeCategory = visibleCategoryIds == null || visibleCategoryIds.includes(row.categoryId);
    const canSeeGroup =
      row.groupId == null ||
      canSeeCategory ||
      (visibleGroupIds != null && visibleGroupIds.has(row.groupId));

    if (!canSeeGroup) {
      continue;
    }

    const existingPin = pins.get(row.categoryId);

    if (!existingPin) {
      pins.set(row.categoryId, {
        id: row.categoryId,
        title: row.categoryName,
        href: `/admin/groups/${row.categoryId}`,
        groups: row.groupId
          ? [
              {
                id: row.groupId,
                title: row.groupName ?? "Untitled group",
                href: `/admin/groups/${row.categoryId}/${row.groupId}`,
              },
            ]
          : [],
      });
      continue;
    }

    if (row.groupId) {
      existingPin.groups.push({
        id: row.groupId,
        title: row.groupName ?? "Untitled group",
        href: `/admin/groups/${row.categoryId}/${row.groupId}`,
      });
    }
  }

  return {
    adminGroupPins: [...pins.values()],
  };
}

// ─── Member (portal) ────────────────────────────────────────────────────────

/**
 * Sends a member to `/portal/legal` while any published document is unanswered.
 *
 * Status is deliberately not narrowed to `active`. The gate used to fire only
 * for active members, which meant an org admin working entirely inside `/admin`
 * — and anyone suspended or archived who could still reach a signed-in page —
 * never saw a policy prompt and never produced an acknowledgement row. The
 * people handling everyone else's data were the only ones with no record of
 * having been informed. The Viewer never carries a deleted member, so every
 * status arriving here is one that reaches a real surface.
 *
 * `/portal/legal` calls the member guard with no options, so the page that
 * clears the block cannot redirect to itself.
 */
async function redirectIfPoliciesOutstanding(orgId: string, memberId: string) {
  const outstanding = await listOutstandingPolicies(orgId, memberId);

  if (outstanding.length > 0) {
    redirect("/portal/legal");
  }
}

export async function requireCurrentMemberAccess(
  viewer: Viewer,
  options?: {
    requireProfileComplete?: boolean;
    requirePolicyAcknowledgement?: boolean;
  },
) {
  const { organization, member } = viewer;

  if (!member) {
    // A system admin can legitimately have no membership (the first-run wizard
    // can create one without it), so send them to admin rather than to signup.
    redirect(isSystemAdmin(viewer) ? "/admin" : "/join");
  }

  // Deliberately ahead of the profile check: nobody should be asked to fill in
  // custom fields before being told how their data is handled. A legal
  // obligation outranks profile hygiene.
  if (options?.requirePolicyAcknowledgement) {
    await redirectIfPoliciesOutstanding(organization.id, member.id);
  }

  if (options?.requireProfileComplete && member.status === "active") {
    const completeness = await getPostApprovalCompleteness(organization.id, member.id);

    if (!completeness.isComplete) {
      redirect("/portal/profile?incomplete=1");
    }
  }

  return {
    viewer,
    organization,
    member,
  };
}

export async function requireCurrentMember(viewer: Viewer) {
  const { member } = await requireCurrentMemberAccess(viewer);
  return member;
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export async function requireAdminAccess(
  viewer: Viewer,
  options?: {
    capability?: keyof AppCapabilities;
    requireFullAccess?: boolean;
  },
): Promise<AdminAccess> {
  const capabilities = getCapabilities(viewer);

  if (!capabilities.canAccessAdmin) {
    forbidden();
  }

  if (options?.requireFullAccess && getAdminAccessLevel(viewer) !== "full") {
    forbidden();
  }

  if (options?.capability && !capabilities[options.capability]) {
    forbidden();
  }

  // Admins are data subjects too, and they are the ones handling everybody
  // else's record. A system admin with no membership has nothing to answer for
  // and is left alone.
  if (viewer.member) {
    await redirectIfPoliciesOutstanding(viewer.organization.id, viewer.member.id);
  }

  return toAdminAccess(viewer);
}

export async function requireOrgAdminAccess(viewer: Viewer) {
  const { organization, member } = await requireAdminAccess(viewer, {
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  return { viewer, organization, member };
}

export async function requireGroupAdminModuleAccess(viewer: Viewer) {
  return requireAdminAccess(viewer, { capability: "canManageGroups" });
}

export async function requireCategoryOverviewAccess(viewer: Viewer, categoryId: string) {
  const context = await requireGroupAdminModuleAccess(viewer);
  if (!canOverseeCategory(viewer, categoryId)) forbidden();
  return context;
}

export async function requireCategoryManagementAccess(viewer: Viewer, categoryId: string) {
  const context = await requireGroupAdminModuleAccess(viewer);
  if (!canManageCategory(viewer, categoryId)) forbidden();
  return context;
}

async function loadGroupRef(orgId: string, groupId: string) {
  const [group] = await db
    .select({ id: groups.id, categoryId: groups.categoryId })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), eq(groups.id, groupId)))
    .limit(1);
  return group ?? null;
}

export async function requireGroupManagementAccess(viewer: Viewer, groupId: string) {
  const context = await requireGroupAdminModuleAccess(viewer);
  const group = await loadGroupRef(viewer.organization.id, groupId);
  if (!group || !canManageGroup(viewer, group)) forbidden();
  return context;
}

/**
 * A Workspace link writes to Google, so it stays behind the org-admin gate even
 * in categories where `groupAdminsManageMembers` lets group admins manage the
 * roster. Same gate for the drift inbox: adopting or removing a drift row moves
 * membership on one side or the other.
 */
export async function requireWorkspaceLinkAccess(viewer: Viewer, groupId: string) {
  const context = await requireGroupManagementAccess(viewer, groupId);

  if (!managesEveryGroup(viewer)) {
    throw new Error(
      "Only organization admins can change the Workspace link for a group.",
    );
  }

  return context;
}

// ─── Events ─────────────────────────────────────────────────────────────────

/**
 * Turns an owner reference into the ids `canManageOwner` needs. A group owner
 * is looked up so its category is known; a missing owner is `null`.
 */
async function resolveOwner(
  orgId: string,
  ownerType: EventOwnerType,
  ownerId: string | null | undefined,
): Promise<EventOwner | null> {
  if (ownerType === "organization") return { type: "organization" };
  if (!ownerId) return null;
  if (ownerType === "category") return { type: "category", categoryId: ownerId };
  const group = await loadGroupRef(orgId, ownerId);
  return group ? { type: "group", group } : null;
}

/**
 * Who may manage an event, decided by its owner (`canManageOwner`). Used both
 * before a row exists (create) and after (everything else, through
 * `requireEventManagementAccess`).
 */
export async function requireEventOwnerAccess(
  viewer: Viewer,
  ownerType: EventOwnerType,
  ownerId?: string | null,
) {
  const context = await requireGroupAdminModuleAccess(viewer);
  const owner = await resolveOwner(viewer.organization.id, ownerType, ownerId);
  if (!owner || !canManageOwner(viewer, owner)) forbidden();
  return context;
}

/** Non-throwing: may the viewer open the admin record of this event? */
export async function canManageEvent(
  viewer: Viewer,
  event: Pick<Event, "ownerType" | "ownerGroupId" | "ownerCategoryId">,
): Promise<boolean> {
  const owner = await resolveOwner(
    viewer.organization.id,
    event.ownerType,
    event.ownerType === "group" ? event.ownerGroupId : event.ownerCategoryId,
  );
  return owner != null && canManageOwner(viewer, owner);
}

/** Loads a live event in the current org and checks management access to its owner. */
export async function requireEventManagementAccess(viewer: Viewer, eventId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.orgId, viewer.organization.id),
        eq(events.id, eventId),
        isNull(events.deletedAt),
      ),
    )
    .limit(1);

  if (!event) {
    forbidden();
  }

  const context = await requireEventOwnerAccess(
    viewer,
    event.ownerType,
    event.ownerType === "group" ? event.ownerGroupId : event.ownerCategoryId,
  );

  return { context, event };
}

// ─── Payments ───────────────────────────────────────────────────────────────

/**
 * Payment scope (see CONTEXT.md) through the capability door: what the
 * dashboard shows and what the mutations accept. `null` when the viewer has
 * no `canManagePayments` at all — the manager door below may still apply.
 */
export async function getPaymentScope(viewer: Viewer): Promise<PaymentScope | null> {
  if (!getCapabilities(viewer).canManagePayments) return null;
  if (getAdminAccessLevel(viewer) === "full") return "full";
  if (!viewer.member) return null;

  const orgId = viewer.organization.id;
  const groupIds = viewer.scope.groups.map((group) => group.id);
  const categoryIds = viewer.scope.categoryIds;
  const [memberIds, eventIds] = await Promise.all([
    listMemberIdsInGroups(orgId, groupIds),
    listEventIdsOwnedBy(orgId, { groupIds, categoryIds }),
  ]);
  return { memberIds, eventIds };
}

/** Events owned by any of the given groups or categories. */
async function listEventIdsOwnedBy(
  orgId: string,
  owners: { groupIds: string[]; categoryIds: string[] },
): Promise<string[]> {
  if (owners.groupIds.length === 0 && owners.categoryIds.length === 0) return [];
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.orgId, orgId),
        isNull(events.deletedAt),
        or(
          owners.groupIds.length ? inArray(events.ownerGroupId, owners.groupIds) : undefined,
          owners.categoryIds.length ? inArray(events.ownerCategoryId, owners.categoryIds) : undefined,
        ),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Payment scope for a concrete set of payments, through both doors: the
 * capability scope, widened by every event among `rows` the viewer manages
 * (whoever manages an event marks its payments paid from the response list,
 * with no `canManagePayments` needed). Never throws; an empty scope is the
 * caller's `forbidden()`.
 */
export async function resolvePaymentScopeForRows(
  viewer: Viewer,
  rows: readonly { eventId: string | null }[],
): Promise<PaymentScope> {
  const capabilityScope = await getPaymentScope(viewer);
  if (capabilityScope === "full") return "full";

  const base: Exclude<PaymentScope, "full"> = capabilityScope ?? EMPTY_PAYMENT_SCOPE;

  const candidateEventIds = [
    ...new Set(rows.flatMap((row) => row.eventId ?? []).filter((id) => !base.eventIds.includes(id))),
  ];
  if (!viewer.member || candidateEventIds.length === 0) return base;

  const candidates = await db
    .select({
      id: events.id,
      ownerType: events.ownerType,
      ownerGroupId: events.ownerGroupId,
      ownerCategoryId: events.ownerCategoryId,
    })
    .from(events)
    .where(
      and(
        eq(events.orgId, viewer.organization.id),
        isNull(events.deletedAt),
        inArray(events.id, candidateEventIds),
      ),
    );

  const managed: string[] = [];
  for (const event of candidates) {
    if (await canManageEvent(viewer, event)) managed.push(event.id);
  }
  return { memberIds: base.memberIds, eventIds: [...base.eventIds, ...managed] };
}

// ─── Forms ──────────────────────────────────────────────────────────────────

/**
 * Same owner table as events: a form is managed by whoever manages its
 * owner. Thin alias so the two cannot drift.
 */
export async function requireFormOwnerAccess(
  viewer: Viewer,
  ownerType: EventOwnerType,
  ownerId?: string | null,
) {
  return requireEventOwnerAccess(viewer, ownerType, ownerId);
}

/**
 * Loads a live form in the current org and checks management access.
 *
 * Templates are org-wide: every manager may read one (to copy it), only org
 * admins may change or delete it. Everything else dispatches on the owner.
 */
export async function requireFormManagementAccess(
  viewer: Viewer,
  formId: string,
  options: { write?: boolean } = {},
) {
  const [form] = await db
    .select()
    .from(forms)
    .where(
      and(eq(forms.orgId, viewer.organization.id), eq(forms.id, formId), isNull(forms.deletedAt)),
    )
    .limit(1);

  if (!form) {
    forbidden();
  }

  if (form.isTemplate) {
    const context = await requireGroupAdminModuleAccess(viewer);
    if (options.write && !context.capabilities.canManageOrganization) {
      forbidden();
    }
    return { context, form };
  }

  const context = await requireFormOwnerAccess(
    viewer,
    form.ownerType,
    form.ownerType === "group" ? form.ownerGroupId : form.ownerCategoryId,
  );

  return { context, form };
}

/** Attaching or detaching needs management access to both sides. */
export async function requireFormAttachAccess(viewer: Viewer, formId: string, eventId: string) {
  const [{ context, form }, { event }] = await Promise.all([
    requireFormManagementAccess(viewer, formId, { write: true }),
    requireEventManagementAccess(viewer, eventId),
  ]);
  return { context, form, event };
}

/**
 * The owners the viewer may create events for, which is also the filter for
 * the admin event list. Org-wide access is a boolean; scoped access lists ids.
 */
export async function listManageableOwners(
  viewer: Viewer,
): Promise<{ organization: boolean; categoryIds: string[]; groupIds: string[] }> {
  const orgId = viewer.organization.id;

  if (managesEveryGroup(viewer)) {
    const [categoryRows, groupRows] = await Promise.all([
      db.select({ id: groupCategories.id }).from(groupCategories).where(eq(groupCategories.orgId, orgId)),
      db.select({ id: groups.id }).from(groups).where(eq(groups.orgId, orgId)),
    ]);

    return {
      organization: true,
      categoryIds: categoryRows.map((row) => row.id),
      groupIds: groupRows.map((row) => row.id),
    };
  }

  if (!viewer.member) {
    return { organization: false, categoryIds: [], groupIds: [] };
  }

  const scopedCategoryIds = viewer.scope.categoryIds;
  const scopedGroupIds = viewer.scope.groups.map((group) => group.id);

  // A category admin manages every group in the category, so those groups are
  // manageable owners too.
  const categoryGroupRows =
    scopedCategoryIds.length > 0
      ? await db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.orgId, orgId), inArray(groups.categoryId, scopedCategoryIds)))
      : [];

  return {
    organization: canManageOwner(viewer, { type: "organization" }),
    categoryIds: scopedCategoryIds,
    groupIds: [...new Set([...scopedGroupIds, ...categoryGroupRows.map((row) => row.id)])],
  };
}
