import {
  boolean,
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
    fullName: text("full_name").notNull(),
    role: tenantRoleEnum("role").notNull().default("member"),
    status: membershipStatusEnum("status").notNull().default("pending"),
    phone: text("phone"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    postalCode: text("postal_code"),
    countryCode: text("country_code").notNull().default("CZ"),
    notes: text("notes"),
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }),
    acceptedPrivacyAt: timestamp("accepted_privacy_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    profile: jsonb("profile").$type<Record<string, string | null>>().notNull().default({}),
    ...timestamps,
  },
  (table) => ({
    orgUserIdx: uniqueIndex("tenant_members_org_user_idx").on(table.orgId, table.userId),
    orgEmailIdx: index("tenant_members_org_email_idx").on(table.orgId, table.email),
    orgStatusIdx: index("tenant_members_org_status_idx").on(table.orgId, table.status),
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
};

export type SystemRole = typeof systemRoleEnum.enumValues[number];
export type TenantRole = typeof tenantRoleEnum.enumValues[number];
export type MembershipStatus = typeof membershipStatusEnum.enumValues[number];
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
export type TenantMember = typeof tenantMembers.$inferSelect;
