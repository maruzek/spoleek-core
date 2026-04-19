import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

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
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
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
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.token),
    userIdx: index("sessions_user_idx").on(table.userId),
  }),
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
  (table) => ({
    providerAccountIdx: uniqueIndex("accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
    userIdx: index("accounts_user_idx").on(table.userId),
  }),
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
  (table) => ({
    identifierIdx: index("verifications_identifier_idx").on(table.identifier),
  }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
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
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
  }),
);

export const organizationPolicies = pgTable(
  "organization_policies",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
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
  (table) => ({
    orgIdx: uniqueIndex("organization_policies_org_idx").on(table.orgId),
  }),
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => ({
    orgUserIdx: uniqueIndex("tenant_members_org_user_idx").on(table.orgId, table.userId),
    orgEmailIdx: index("tenant_members_org_email_idx").on(table.orgId, table.email),
    orgStatusIdx: index("tenant_members_org_status_idx").on(table.orgId, table.status),
  }),
);

export const groupCategories = pgTable(
  "group_categories",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
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
  (table) => ({
    orgSlugIdx: uniqueIndex("group_categories_org_slug_idx").on(table.orgId, table.slug),
    orgSortIdx: index("group_categories_org_sort_idx").on(table.orgId, table.sortOrder),
    orgActiveIdx: index("group_categories_org_active_idx").on(table.orgId, table.isActive),
  }),
);

export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    joinPolicy: groupJoinPolicyEnum("join_policy").notNull().default("admin_only"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    orgSlugIdx: uniqueIndex("groups_org_slug_idx").on(table.orgId, table.slug),
    categorySortIdx: index("groups_category_sort_idx").on(table.categoryId, table.sortOrder),
    orgCategoryIdx: index("groups_org_category_idx").on(table.orgId, table.categoryId),
    orgActiveIdx: index("groups_org_active_idx").on(table.orgId, table.isActive),
  }),
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    role: groupMembershipRoleEnum("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => ({
    groupMemberIdx: uniqueIndex("group_memberships_group_member_idx").on(
      table.groupId,
      table.memberId,
    ),
    orgMemberIdx: index("group_memberships_org_member_idx").on(table.orgId, table.memberId),
    orgGroupRoleIdx: index("group_memberships_org_group_role_idx").on(
      table.orgId,
      table.groupId,
      table.role,
    ),
  }),
);

export const categoryAdminAssignments = pgTable(
  "category_admin_assignments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => ({
    categoryMemberIdx: uniqueIndex("category_admin_assignments_category_member_idx").on(
      table.categoryId,
      table.memberId,
    ),
    orgCategoryIdx: index("category_admin_assignments_org_category_idx").on(
      table.orgId,
      table.categoryId,
    ),
    orgMemberIdx: index("category_admin_assignments_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
  }),
);

export const memberCustomFields = pgTable(
  "member_custom_fields",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
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
  (table) => ({
    orgKeyIdx: uniqueIndex("member_custom_fields_org_key_idx").on(table.orgId, table.key),
    orgSortIdx: index("member_custom_fields_org_sort_idx").on(table.orgId, table.sortOrder),
    orgStageIdx: index("member_custom_fields_org_stage_idx").on(table.orgId, table.stage),
  }),
);

export const memberCustomFieldValues = pgTable(
  "member_custom_field_values",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => memberCustomFields.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: integer("value_number"),
    valueBoolean: boolean("value_boolean"),
    valueDate: timestamp("value_date", { withTimezone: true }),
    valueJson: jsonb("value_json").$type<string[] | Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => ({
    memberFieldIdx: uniqueIndex("member_custom_field_values_member_field_idx").on(
      table.memberId,
      table.fieldId,
    ),
    orgMemberIdx: index("member_custom_field_values_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
    orgFieldIdx: index("member_custom_field_values_org_field_idx").on(
      table.orgId,
      table.fieldId,
    ),
  }),
);

export const memberInvites = pgTable(
  "member_invites",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id")
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
  (table) => ({
    memberIdx: uniqueIndex("member_invites_member_idx").on(table.memberId),
    providerEmailIdx: uniqueIndex("member_invites_provider_email_idx").on(table.providerEmailId),
    orgStatusIdx: index("member_invites_org_status_idx").on(table.orgId, table.status),
    orgDeliveryStatusIdx: index("member_invites_org_delivery_status_idx").on(
      table.orgId,
      table.deliveryStatus,
    ),
  }),
);

export const memberAuthEvents = pgTable(
  "member_auth_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inviteId: text("invite_id").references(() => memberInvites.id, { onDelete: "set null" }),
    eventType: memberAuthEventTypeEnum("event_type").notNull(),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => ({
    orgMemberCreatedIdx: index("member_auth_events_org_member_created_idx").on(
      table.orgId,
      table.memberId,
      table.createdAt,
    ),
    orgEventTypeIdx: index("member_auth_events_org_event_type_idx").on(
      table.orgId,
      table.eventType,
    ),
  }),
);

export const workspaceConnections = pgTable(
  "workspace_connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
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
  (table) => ({
    orgIdx: uniqueIndex("workspace_connections_org_idx").on(table.orgId),
  }),
);

export const emailActivities = pgTable(
  "email_activities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: emailDirectionEnum("direction").notNull().default("outbound"),
    kind: emailKindEnum("kind").notNull(),
    currentStatus: emailActivityStatusEnum("current_status").notNull(),
    memberId: text("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    inviteId: text("invite_id").references(() => memberInvites.id, {
      onDelete: "set null",
    }),
    resendOfEmailActivityId: text("resend_of_email_activity_id"),
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
  (table) => ({
    providerEmailIdx: uniqueIndex("email_activities_provider_email_idx").on(
      table.providerEmailId,
    ),
    orgStatusIdx: index("email_activities_org_status_idx").on(
      table.orgId,
      table.currentStatus,
    ),
    orgKindIdx: index("email_activities_org_kind_idx").on(table.orgId, table.kind),
    orgSentIdx: index("email_activities_org_sent_idx").on(table.orgId, table.sentAt),
    orgMemberIdx: index("email_activities_org_member_idx").on(table.orgId, table.memberId),
  }),
);

export const emailActivityEvents = pgTable(
  "email_activity_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailActivityId: text("email_activity_id")
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
  (table) => ({
    activityOccurredIdx: index("email_activity_events_activity_occurred_idx").on(
      table.emailActivityId,
      table.occurredAt,
    ),
    orgOccurredIdx: index("email_activity_events_org_occurred_idx").on(
      table.orgId,
      table.occurredAt,
    ),
  }),
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
