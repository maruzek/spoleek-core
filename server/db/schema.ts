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

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  organizationPolicies,
  tenantMembers,
  memberCustomFields,
  memberCustomFieldValues,
};

export type SystemRole = typeof systemRoleEnum.enumValues[number];
export type TenantRole = typeof tenantRoleEnum.enumValues[number];
export type MembershipStatus = typeof membershipStatusEnum.enumValues[number];
export type MemberCustomFieldType = typeof memberCustomFieldTypeEnum.enumValues[number];
export type MemberCustomFieldStage = typeof memberCustomFieldStageEnum.enumValues[number];
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type MemberCustomField = typeof memberCustomFields.$inferSelect;
export type MemberCustomFieldValue = typeof memberCustomFieldValues.$inferSelect;
