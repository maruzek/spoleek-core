import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const systemRoleEnum = pgEnum("system_role", [
  "member",
  "system_admin",
]);

export const tenantRoleEnum = pgEnum("tenant_role", [
  "member",
  "leader",
  "org_admin",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "pending",
  "active",
  "suspended",
  "archived",
  "deleted",
]);

export const memberInviteStatusEnum = pgEnum("member_invite_status", [
  "pending",
  "sent",
  "completed",
  "expired",
  "failed",
]);

export const memberInviteDeliveryStatusEnum = pgEnum("member_invite_delivery_status", [
  "pending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const memberAuthEventTypeEnum = pgEnum("member_auth_event_type", [
  "member_approved",
  "invite_send_requested",
  "invite_sent",
  "invite_send_skipped",
  "invite_delivery_updated",
  "invite_completed",
  "activation_attempt_blocked",
  "password_reset_sent",
  "workspace_provisioned",
  "workspace_provision_failed",
  "workspace_user_linked",
]);

export const emailDirectionEnum = pgEnum("email_direction", [
  "outbound",
  "inbound",
]);

export const emailKindEnum = pgEnum("email_kind", [
  "member_activation_invite",
  "workspace_welcome",
]);

export const emailActivityStatusEnum = pgEnum("email_activity_status", [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const emailActivityEventTypeEnum = pgEnum("email_activity_event_type", [
  "api_accepted",
  "resend_requested",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const memberCustomFieldTypeEnum = pgEnum("member_custom_field_type", [
  "text",
  "textarea",
  "boolean",
  "number",
  "email",
  "phone",
  "date",
  "select",
  "multi_select",
]);

export const memberCustomFieldStageEnum = pgEnum("member_custom_field_stage", [
  "registration",
  "post_approval",
  "optional",
]);

export const memberCustomFieldDiscoveryModeEnum = pgEnum(
  "member_custom_field_discovery_mode",
  ["visible", "available", "hidden"]
);

export const groupCategorySelectionModeEnum = pgEnum(
  "group_category_selection_mode",
  ["single", "multiple"],
);

export const groupJoinPolicyEnum = pgEnum("group_join_policy", [
  "admin_only",
  "free_join_leave",
  "request_to_join",
]);

export const groupMembershipRoleEnum = pgEnum("group_membership_role", [
  "member",
  "group_admin",
]);

export const membershipManagementModeEnum = pgEnum("membership_management_mode", [
  "none",
  "periodic_renewal",
]);

export const memberPreferredEmailEnum = pgEnum("member_preferred_email", [
  "personal",
  "workspace",
]);

export const memberPaymentTypeEnum = pgEnum("member_payment_type", [
  "membership_fee",
  "event",
]);

export const memberPaymentStatusEnum = pgEnum("member_payment_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Better Auth-managed tables (text IDs, do not change to uuid) ────────────

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    systemRole: systemRoleEnum("system_role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
  ],
);

// ─── Application-owned tables (uuid IDs) ─────────────────────────────────────

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    primaryEmail: text("primary_email"),
    website: text("website"),
    joinPageHeadline: text("join_page_headline").notNull().default("Join our organization"),
    joinPageBody: text("join_page_body").notNull().default(
      "Tell us a little about yourself and submit your application. We will review it and get back to you soon.",
    ),
    countryCode: text("country_code").notNull().default("CZ"),
    locale: text("locale").notNull().default("en"),
    timezone: text("timezone").notNull().default("Europe/Prague"),
    setupDeploymentTrack: text("setup_deployment_track"),
    setupAuthStrategy: text("setup_auth_strategy"),
    workspaceDomain: text("workspace_domain"),
    workspaceSyncEnabled: boolean("workspace_sync_enabled").notNull().default(false),
    workspaceModuleEnabled: boolean("workspace_module_enabled").notNull().default(false),
    workspaceEmailTemplate: text("workspace_email_template")
      .notNull()
      .default("{first}.{last}"),
    workspaceConnectedAt: timestamp("workspace_connected_at", {
      withTimezone: true,
    }),
    workspaceAdminEmail: text("workspace_admin_email"),
    defaultEmailPreference: memberPreferredEmailEnum("default_email_preference")
      .notNull()
      .default("personal"),
    membershipManagementMode: membershipManagementModeEnum("membership_management_mode")
      .notNull()
      .default("none"),
    membershipRenewalMonth: integer("membership_renewal_month"),
    membershipRenewalDay: integer("membership_renewal_day"),
    membershipFeeEnabled: boolean("membership_fee_enabled").notNull().default(false),
    membershipFeeAmount: integer("membership_fee_amount"),
    membershipFeeCurrency: text("membership_fee_currency").notNull().default("CZK"),
    membershipFeeBankAccount: text("membership_fee_bank_account"),
    membershipFeePaymentWindowDays: integer("membership_fee_payment_window_days")
      .notNull()
      .default(30),
    emailNotifyRenewalHeadsup: boolean("email_notify_renewal_headsup").notNull().default(true),
    emailNotifyRenewalHeadsupDaysBefore: integer("email_notify_renewal_headsup_days_before")
      .notNull()
      .default(7),
    emailNotifyOverdue: boolean("email_notify_overdue").notNull().default(true),
    emailNotifyPaymentConfirmed: boolean("email_notify_payment_confirmed").notNull().default(true),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    check(
      "organizations_renewal_month_check",
      sql`${table.membershipRenewalMonth} IS NULL OR (${table.membershipRenewalMonth} >= 1 AND ${table.membershipRenewalMonth} <= 12)`,
    ),
    check(
      "organizations_renewal_day_check",
      sql`${table.membershipRenewalDay} IS NULL OR (${table.membershipRenewalDay} >= 1 AND ${table.membershipRenewalDay} <= 31)`,
    ),
    check(
      "organizations_fee_amount_check",
      sql`${table.membershipFeeAmount} IS NULL OR ${table.membershipFeeAmount} > 0`,
    ),
    check(
      "organizations_payment_window_check",
      sql`${table.membershipFeePaymentWindowDays} >= 1`,
    ),
  ],
);

export const organizationPolicies = pgTable(
  "organization_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    termsOfServiceLabel: text("terms_of_service_label").notNull(),
    termsOfServiceText: text("terms_of_service_text").notNull(),
    privacyPolicyLabel: text("privacy_policy_label").notNull(),
    privacyPolicyText: text("privacy_policy_text").notNull(),
    memberInviteEmailSubject: text("member_invite_email_subject")
      .notNull()
      .default("Your membership has been approved"),
    memberInviteEmailBody: text("member_invite_email_body")
      .notNull()
      .default(
        "Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.",
      ),
    version: text("version").notNull().default("v1"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organization_policies_org_idx").on(table.orgId),
  ],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    role: tenantRoleEnum("role").notNull().default("member"),
    status: membershipStatusEnum("status").notNull().default("pending"),
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }),
    acceptedPrivacyAt: timestamp("accepted_privacy_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    workspaceUserEmail: text("workspace_user_email"),
    workspaceUserId: text("workspace_user_id"),
    workspaceProvisionedAt: timestamp("workspace_provisioned_at", {
      withTimezone: true,
    }),
    preferredEmail: memberPreferredEmailEnum("preferred_email"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenant_members_org_user_idx").on(table.orgId, table.userId),
    index("tenant_members_org_email_idx").on(table.orgId, table.email),
    index("tenant_members_org_status_idx").on(table.orgId, table.status),
    index("tenant_members_user_idx").on(table.userId),
    index("tenant_members_active_idx")
      .on(table.orgId, table.status)
      .where(sql`status != 'deleted'`),
  ],
);

export const groupCategories = pgTable(
  "group_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    registrationFieldLabel: text("registration_field_label"),
    isActive: boolean("is_active").notNull().default(true),
    isPinnedToNavigation: boolean("is_pinned_to_navigation").notNull().default(false),
    showInRegistration: boolean("show_in_registration").notNull().default(false),
    showInMembersTable: boolean("show_in_members_table").notNull().default(false),
    groupAdminsManageMembers: boolean("group_admins_manage_members")
      .notNull()
      .default(false),
    managesMembershipFees: boolean("manages_membership_fees")
      .notNull()
      .default(false),
    selectionMode: groupCategorySelectionModeEnum("selection_mode")
      .notNull()
      .default("multiple"),
    selectionRequired: boolean("selection_required").notNull().default(false),
    maxSelections: integer("max_selections"),
    defaultJoinPolicy: groupJoinPolicyEnum("default_join_policy")
      .notNull()
      .default("admin_only"),
    sortOrder: integer("sort_order").notNull().default(0),
    specialCapability: text("special_capability"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("group_categories_org_slug_idx").on(table.orgId, table.slug),
    index("group_categories_org_sort_idx").on(table.orgId, table.sortOrder),
    index("group_categories_org_active_idx").on(table.orgId, table.isActive),
    check(
      "group_categories_max_selections_check",
      sql`${table.maxSelections} IS NULL OR ${table.maxSelections} >= 1`,
    ),
    check(
      "group_categories_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    joinPolicy: groupJoinPolicyEnum("join_policy").notNull().default("admin_only"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    feeRenewalMonth: integer("fee_renewal_month"),
    feeRenewalDay: integer("fee_renewal_day"),
    feeAmount: integer("fee_amount"),
    feeCurrency: text("fee_currency"),
    feeBankAccount: text("fee_bank_account"),
    feePaymentWindowDays: integer("fee_payment_window_days"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("groups_org_slug_idx").on(table.orgId, table.slug),
    index("groups_category_sort_idx").on(table.categoryId, table.sortOrder),
    index("groups_org_category_idx").on(table.orgId, table.categoryId),
    index("groups_org_active_idx").on(table.orgId, table.isActive),
    check(
      "groups_fee_renewal_month_check",
      sql`${table.feeRenewalMonth} IS NULL OR (${table.feeRenewalMonth} >= 1 AND ${table.feeRenewalMonth} <= 12)`,
    ),
    check(
      "groups_fee_renewal_day_check",
      sql`${table.feeRenewalDay} IS NULL OR (${table.feeRenewalDay} >= 1 AND ${table.feeRenewalDay} <= 31)`,
    ),
    check(
      "groups_fee_amount_check",
      sql`${table.feeAmount} IS NULL OR ${table.feeAmount} > 0`,
    ),
    check(
      "groups_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    role: groupMembershipRoleEnum("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("group_memberships_group_member_idx").on(
      table.groupId,
      table.memberId,
    ),
    index("group_memberships_org_member_idx").on(table.orgId, table.memberId),
    index("group_memberships_org_group_role_idx").on(
      table.orgId,
      table.groupId,
      table.role,
    ),
  ],
);

export const categoryAdminAssignments = pgTable(
  "category_admin_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("category_admin_assignments_category_member_idx").on(
      table.categoryId,
      table.memberId,
    ),
    index("category_admin_assignments_org_category_idx").on(
      table.orgId,
      table.categoryId,
    ),
    index("category_admin_assignments_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
  ],
);

export const memberCustomFields = pgTable(
  "member_custom_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    type: memberCustomFieldTypeEnum("type").notNull(),
    stage: memberCustomFieldStageEnum("stage").notNull().default("optional"),
    discoveryMode: memberCustomFieldDiscoveryModeEnum("discovery_mode").notNull().default("available"),
    required: boolean("required").notNull().default(false),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_custom_fields_org_key_idx").on(table.orgId, table.key),
    index("member_custom_fields_org_sort_idx").on(table.orgId, table.sortOrder),
    index("member_custom_fields_org_stage_idx").on(table.orgId, table.stage),
    check(
      "member_custom_fields_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export type CustomFieldValue = string | number | boolean | string[] | null;

export const memberCustomFieldValues = pgTable(
  "member_custom_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => memberCustomFields.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<CustomFieldValue>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_custom_field_values_member_field_idx").on(
      table.memberId,
      table.fieldId,
    ),
    index("member_custom_field_values_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
    index("member_custom_field_values_org_field_idx").on(
      table.orgId,
      table.fieldId,
    ),
  ],
);

export const memberInvites = pgTable(
  "member_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    provisionedUserId: text("provisioned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedUserId: text("claimed_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: memberInviteStatusEnum("status").notNull().default("pending"),
    deliveryStatus: memberInviteDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    tokenHash: text("token_hash"),
    providerEmailId: text("provider_email_id"),
    resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
    resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }),
    deliveryUpdatedAt: timestamp("delivery_updated_at", { withTimezone: true }),
    lastDeliveryEvent: text("last_delivery_event"),
    activationAttemptCount: integer("activation_attempt_count").notNull().default(0),
    lastActivationAttemptAt: timestamp("last_activation_attempt_at", { withTimezone: true }),
    activationBlockedUntil: timestamp("activation_blocked_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    resendCount: integer("resend_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_invites_member_idx").on(table.memberId),
    uniqueIndex("member_invites_provider_email_idx")
      .on(table.providerEmailId)
      .where(sql`provider_email_id IS NOT NULL`),
    index("member_invites_org_status_idx").on(table.orgId, table.status),
    index("member_invites_org_delivery_status_idx").on(
      table.orgId,
      table.deliveryStatus,
    ),
  ],
);

export const memberAuthEvents = pgTable(
  "member_auth_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inviteId: uuid("invite_id").references(() => memberInvites.id, { onDelete: "set null" }),
    eventType: memberAuthEventTypeEnum("event_type").notNull(),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [
    index("member_auth_events_org_member_created_idx").on(
      table.orgId,
      table.memberId,
      table.createdAt,
    ),
    index("member_auth_events_org_event_type_idx").on(
      table.orgId,
      table.eventType,
    ),
  ],
);

export const workspaceConnections = pgTable(
  "workspace_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedByEmail: text("granted_by_email"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_connections_org_idx").on(table.orgId),
  ],
);

export const emailActivities = pgTable(
  "email_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: emailDirectionEnum("direction").notNull().default("outbound"),
    kind: emailKindEnum("kind").notNull(),
    currentStatus: emailActivityStatusEnum("current_status").notNull(),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    inviteId: uuid("invite_id").references(() => memberInvites.id, {
      onDelete: "set null",
    }),
    resendOfEmailActivityId: uuid("resend_of_email_activity_id"),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    providerEmailId: text("provider_email_id"),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    providerEventType: text("provider_event_type"),
    lastError: text("last_error"),
    problemAt: timestamp("problem_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastStatusAt: timestamp("last_status_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("email_activities_provider_email_idx")
      .on(table.providerEmailId)
      .where(sql`provider_email_id IS NOT NULL`),
    index("email_activities_org_status_idx").on(
      table.orgId,
      table.currentStatus,
    ),
    index("email_activities_org_kind_idx").on(table.orgId, table.kind),
    index("email_activities_org_sent_idx").on(table.orgId, table.sentAt),
    index("email_activities_org_member_idx").on(table.orgId, table.memberId),
  ],
);

export const emailActivityEvents = pgTable(
  "email_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailActivityId: uuid("email_activity_id")
      .notNull()
      .references(() => emailActivities.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: emailActivityEventTypeEnum("event_type").notNull(),
    providerEventType: text("provider_event_type"),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("email_activity_events_activity_occurred_idx").on(
      table.emailActivityId,
      table.occurredAt,
    ),
    index("email_activity_events_org_occurred_idx").on(
      table.orgId,
      table.occurredAt,
    ),
  ],
);

export const memberPayments = pgTable(
  "member_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    type: memberPaymentTypeEnum("type").notNull().default("membership_fee"),
    status: memberPaymentStatusEnum("status").notNull().default("pending"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    bankAccount: text("bank_account"),
    periodLabel: text("period_label").notNull(),
    periodKey: text("period_key").notNull(),
    variableSymbol: text("variable_symbol"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    confirmedByUserId: text("confirmed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    adminNote: text("admin_note"),
    cancellationReason: text("cancellation_reason"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("member_payments_org_member_idx").on(table.orgId, table.memberId),
    index("member_payments_org_status_idx").on(table.orgId, table.status),
    index("member_payments_org_period_key_idx").on(table.orgId, table.periodKey),
    uniqueIndex("member_payments_member_period_key_idx").on(
      table.memberId,
      table.periodKey,
    ),
    index("member_payments_org_vs_idx").on(table.orgId, table.variableSymbol),
    index("member_payments_member_status_idx").on(table.memberId, table.status),
    index("member_payments_org_due_at_idx").on(table.orgId, table.dueAt),
    check(
      "member_payments_amount_check",
      sql`${table.amount} > 0`,
    ),
  ],
);

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  organizationPolicies,
  tenantMembers,
  groupCategories,
  groups,
  groupMemberships,
  categoryAdminAssignments,
  memberCustomFields,
  memberCustomFieldValues,
  memberInvites,
  memberAuthEvents,
  workspaceConnections,
  emailActivities,
  emailActivityEvents,
  memberPayments,
};

export type SystemRole = typeof systemRoleEnum.enumValues[number];
export type TenantRole = typeof tenantRoleEnum.enumValues[number];
export type MembershipStatus = typeof membershipStatusEnum.enumValues[number];
export type MemberInviteStatus = typeof memberInviteStatusEnum.enumValues[number];
export type MemberInviteDeliveryStatus =
  typeof memberInviteDeliveryStatusEnum.enumValues[number];
export type MemberAuthEventType = typeof memberAuthEventTypeEnum.enumValues[number];
export type EmailDirection = typeof emailDirectionEnum.enumValues[number];
export type EmailKind = typeof emailKindEnum.enumValues[number];
export type EmailActivityStatus = typeof emailActivityStatusEnum.enumValues[number];
export type EmailActivityEventType =
  typeof emailActivityEventTypeEnum.enumValues[number];
export type MemberCustomFieldType = typeof memberCustomFieldTypeEnum.enumValues[number];
export type MemberCustomFieldStage = typeof memberCustomFieldStageEnum.enumValues[number];
export type MemberCustomFieldDiscoveryMode = typeof memberCustomFieldDiscoveryModeEnum.enumValues[number];
export type GroupCategorySelectionMode =
  typeof groupCategorySelectionModeEnum.enumValues[number];
export type GroupJoinPolicy = typeof groupJoinPolicyEnum.enumValues[number];
export type GroupMembershipRole = typeof groupMembershipRoleEnum.enumValues[number];
export type MembershipManagementMode = typeof membershipManagementModeEnum.enumValues[number];
export type MemberPreferredEmail = typeof memberPreferredEmailEnum.enumValues[number];
export type MemberPaymentType = typeof memberPaymentTypeEnum.enumValues[number];
export type MemberPaymentStatus = typeof memberPaymentStatusEnum.enumValues[number];
export type MemberPayment = typeof memberPayments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type GroupCategory = typeof groupCategories.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type CategoryAdminAssignment = typeof categoryAdminAssignments.$inferSelect;
export type MemberCustomField = typeof memberCustomFields.$inferSelect;
export type MemberCustomFieldValue = typeof memberCustomFieldValues.$inferSelect;
export type MemberInvite = typeof memberInvites.$inferSelect;
export type MemberAuthEvent = typeof memberAuthEvents.$inferSelect;
export type WorkspaceConnection = typeof workspaceConnections.$inferSelect;
export type EmailActivity = typeof emailActivities.$inferSelect;
export type EmailActivityEvent = typeof emailActivityEvents.$inferSelect;
