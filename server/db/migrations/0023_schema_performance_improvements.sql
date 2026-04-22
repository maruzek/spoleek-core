-- Schema performance improvements migration
-- 1. Converts text IDs to uuid for application-owned tables
-- 2. Consolidates EAV value columns into single JSONB
-- 3. Adds CHECK constraints
-- 4. Adds missing indexes + partial unique indexes
-- 5. Creates updatedAt trigger function
--
-- WARNING: Destructive migration — drops and recreates all app-owned tables.

-- ═══ Drop all application-owned tables (cascade handles FK deps) ═══
-- Better Auth tables (users, sessions, accounts, verifications) preserved.

DROP TABLE IF EXISTS "email_activity_events" CASCADE;
DROP TABLE IF EXISTS "email_activities" CASCADE;
DROP TABLE IF EXISTS "member_auth_events" CASCADE;
DROP TABLE IF EXISTS "member_invites" CASCADE;
DROP TABLE IF EXISTS "member_custom_field_values" CASCADE;
DROP TABLE IF EXISTS "member_custom_fields" CASCADE;
DROP TABLE IF EXISTS "category_admin_assignments" CASCADE;
DROP TABLE IF EXISTS "group_memberships" CASCADE;
DROP TABLE IF EXISTS "groups" CASCADE;
DROP TABLE IF EXISTS "group_categories" CASCADE;
DROP TABLE IF EXISTS "member_payments" CASCADE;
DROP TABLE IF EXISTS "workspace_connections" CASCADE;
DROP TABLE IF EXISTS "tenant_members" CASCADE;
DROP TABLE IF EXISTS "organization_policies" CASCADE;
DROP TABLE IF EXISTS "organizations" CASCADE;

-- ═══ Recreate all tables with uuid primary keys ═══

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "legal_name" text,
  "primary_email" text,
  "website" text,
  "join_page_headline" text NOT NULL DEFAULT 'Join our organization',
  "join_page_body" text NOT NULL DEFAULT 'Tell us a little about yourself and submit your application. We will review it and get back to you soon.',
  "country_code" text NOT NULL DEFAULT 'CZ',
  "locale" text NOT NULL DEFAULT 'en',
  "timezone" text NOT NULL DEFAULT 'Europe/Prague',
  "setup_deployment_track" text,
  "setup_auth_strategy" text,
  "workspace_domain" text,
  "workspace_sync_enabled" boolean NOT NULL DEFAULT false,
  "workspace_module_enabled" boolean NOT NULL DEFAULT false,
  "workspace_email_template" text NOT NULL DEFAULT '{first}.{last}',
  "workspace_connected_at" timestamp with time zone,
  "workspace_admin_email" text,
  "default_email_preference" "member_preferred_email" NOT NULL DEFAULT 'personal',
  "membership_management_mode" "membership_management_mode" NOT NULL DEFAULT 'none',
  "membership_renewal_month" integer,
  "membership_renewal_day" integer,
  "membership_fee_enabled" boolean NOT NULL DEFAULT false,
  "membership_fee_amount" integer,
  "membership_fee_currency" text NOT NULL DEFAULT 'CZK',
  "membership_fee_bank_account" text,
  "membership_fee_payment_window_days" integer NOT NULL DEFAULT 30,
  "email_notify_renewal_headsup" boolean NOT NULL DEFAULT true,
  "email_notify_renewal_headsup_days_before" integer NOT NULL DEFAULT 7,
  "email_notify_overdue" boolean NOT NULL DEFAULT true,
  "email_notify_payment_confirmed" boolean NOT NULL DEFAULT true,
  "onboarding_completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "organizations_renewal_month_check" CHECK ("membership_renewal_month" IS NULL OR ("membership_renewal_month" >= 1 AND "membership_renewal_month" <= 12)),
  CONSTRAINT "organizations_renewal_day_check" CHECK ("membership_renewal_day" IS NULL OR ("membership_renewal_day" >= 1 AND "membership_renewal_day" <= 31)),
  CONSTRAINT "organizations_fee_amount_check" CHECK ("membership_fee_amount" IS NULL OR "membership_fee_amount" > 0),
  CONSTRAINT "organizations_payment_window_check" CHECK ("membership_fee_payment_window_days" >= 1)
);
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" ("slug");

CREATE TABLE "organization_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "terms_of_service_label" text NOT NULL,
  "terms_of_service_text" text NOT NULL,
  "privacy_policy_label" text NOT NULL,
  "privacy_policy_text" text NOT NULL,
  "member_invite_email_subject" text NOT NULL DEFAULT 'Your membership has been approved',
  "member_invite_email_body" text NOT NULL DEFAULT 'Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.',
  "version" text NOT NULL DEFAULT 'v1',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "organization_policies_org_idx" ON "organization_policies" ("org_id");

CREATE TABLE "tenant_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "email" text,
  "first_name" text NOT NULL DEFAULT '',
  "last_name" text NOT NULL DEFAULT '',
  "role" "tenant_role" NOT NULL DEFAULT 'member',
  "status" "membership_status" NOT NULL DEFAULT 'pending',
  "accepted_terms_at" timestamp with time zone,
  "accepted_privacy_at" timestamp with time zone,
  "linked_at" timestamp with time zone,
  "workspace_user_email" text,
  "workspace_user_id" text,
  "workspace_provisioned_at" timestamp with time zone,
  "preferred_email" "member_preferred_email",
  "deleted_at" timestamp with time zone,
  "deleted_by_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "tenant_members_org_user_idx" ON "tenant_members" ("org_id", "user_id");
CREATE INDEX "tenant_members_org_email_idx" ON "tenant_members" ("org_id", "email");
CREATE INDEX "tenant_members_org_status_idx" ON "tenant_members" ("org_id", "status");
CREATE INDEX "tenant_members_user_idx" ON "tenant_members" ("user_id");
CREATE INDEX "tenant_members_active_idx" ON "tenant_members" ("org_id", "status") WHERE status != 'deleted';

CREATE TABLE "group_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "registration_field_label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_pinned_to_navigation" boolean NOT NULL DEFAULT false,
  "show_in_registration" boolean NOT NULL DEFAULT false,
  "show_in_members_table" boolean NOT NULL DEFAULT false,
  "group_admins_manage_members" boolean NOT NULL DEFAULT false,
  "manages_membership_fees" boolean NOT NULL DEFAULT false,
  "selection_mode" "group_category_selection_mode" NOT NULL DEFAULT 'multiple',
  "selection_required" boolean NOT NULL DEFAULT false,
  "max_selections" integer,
  "default_join_policy" "group_join_policy" NOT NULL DEFAULT 'admin_only',
  "sort_order" integer NOT NULL DEFAULT 0,
  "special_capability" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "group_categories_max_selections_check" CHECK ("max_selections" IS NULL OR "max_selections" >= 1),
  CONSTRAINT "group_categories_sort_order_check" CHECK ("sort_order" >= 0)
);
CREATE UNIQUE INDEX "group_categories_org_slug_idx" ON "group_categories" ("org_id", "slug");
CREATE INDEX "group_categories_org_sort_idx" ON "group_categories" ("org_id", "sort_order");
CREATE INDEX "group_categories_org_active_idx" ON "group_categories" ("org_id", "is_active");

CREATE TABLE "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "group_categories" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "join_policy" "group_join_policy" NOT NULL DEFAULT 'admin_only',
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "fee_renewal_month" integer,
  "fee_renewal_day" integer,
  "fee_amount" integer,
  "fee_currency" text,
  "fee_bank_account" text,
  "fee_payment_window_days" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "groups_fee_renewal_month_check" CHECK ("fee_renewal_month" IS NULL OR ("fee_renewal_month" >= 1 AND "fee_renewal_month" <= 12)),
  CONSTRAINT "groups_fee_renewal_day_check" CHECK ("fee_renewal_day" IS NULL OR ("fee_renewal_day" >= 1 AND "fee_renewal_day" <= 31)),
  CONSTRAINT "groups_fee_amount_check" CHECK ("fee_amount" IS NULL OR "fee_amount" > 0),
  CONSTRAINT "groups_sort_order_check" CHECK ("sort_order" >= 0)
);
CREATE UNIQUE INDEX "groups_org_slug_idx" ON "groups" ("org_id", "slug");
CREATE INDEX "groups_category_sort_idx" ON "groups" ("category_id", "sort_order");
CREATE INDEX "groups_org_category_idx" ON "groups" ("org_id", "category_id");
CREATE INDEX "groups_org_active_idx" ON "groups" ("org_id", "is_active");

CREATE TABLE "group_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "groups" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "role" "group_membership_role" NOT NULL DEFAULT 'member',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "group_memberships_group_member_idx" ON "group_memberships" ("group_id", "member_id");
CREATE INDEX "group_memberships_org_member_idx" ON "group_memberships" ("org_id", "member_id");
CREATE INDEX "group_memberships_org_group_role_idx" ON "group_memberships" ("org_id", "group_id", "role");

CREATE TABLE "category_admin_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "group_categories" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "category_admin_assignments_category_member_idx" ON "category_admin_assignments" ("category_id", "member_id");
CREATE INDEX "category_admin_assignments_org_category_idx" ON "category_admin_assignments" ("org_id", "category_id");
CREATE INDEX "category_admin_assignments_org_member_idx" ON "category_admin_assignments" ("org_id", "member_id");

CREATE TABLE "member_custom_fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "type" "member_custom_field_type" NOT NULL,
  "stage" "member_custom_field_stage" NOT NULL DEFAULT 'optional',
  "discovery_mode" "member_custom_field_discovery_mode" NOT NULL DEFAULT 'available',
  "required" boolean NOT NULL DEFAULT false,
  "options" jsonb NOT NULL DEFAULT '[]',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_custom_fields_sort_order_check" CHECK ("sort_order" >= 0)
);
CREATE UNIQUE INDEX "member_custom_fields_org_key_idx" ON "member_custom_fields" ("org_id", "key");
CREATE INDEX "member_custom_fields_org_sort_idx" ON "member_custom_fields" ("org_id", "sort_order");
CREATE INDEX "member_custom_fields_org_stage_idx" ON "member_custom_fields" ("org_id", "stage");

CREATE TABLE "member_custom_field_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "field_id" uuid NOT NULL REFERENCES "member_custom_fields" ("id") ON DELETE CASCADE,
  "value" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "member_custom_field_values_member_field_idx" ON "member_custom_field_values" ("member_id", "field_id");
CREATE INDEX "member_custom_field_values_org_member_idx" ON "member_custom_field_values" ("org_id", "member_id");
CREATE INDEX "member_custom_field_values_org_field_idx" ON "member_custom_field_values" ("org_id", "field_id");

CREATE TABLE "member_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "provisioned_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "claimed_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "status" "member_invite_status" NOT NULL DEFAULT 'pending',
  "delivery_status" "member_invite_delivery_status" NOT NULL DEFAULT 'pending',
  "token_hash" text,
  "provider_email_id" text,
  "reset_token_expires_at" timestamp with time zone,
  "resend_available_at" timestamp with time zone,
  "delivery_updated_at" timestamp with time zone,
  "last_delivery_event" text,
  "activation_attempt_count" integer NOT NULL DEFAULT 0,
  "last_activation_attempt_at" timestamp with time zone,
  "activation_blocked_until" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "resend_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "member_invites_member_idx" ON "member_invites" ("member_id");
CREATE UNIQUE INDEX "member_invites_provider_email_idx" ON "member_invites" ("provider_email_id") WHERE provider_email_id IS NOT NULL;
CREATE INDEX "member_invites_org_status_idx" ON "member_invites" ("org_id", "status");
CREATE INDEX "member_invites_org_delivery_status_idx" ON "member_invites" ("org_id", "delivery_status");

CREATE TABLE "member_auth_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "actor_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "invite_id" uuid REFERENCES "member_invites" ("id") ON DELETE SET NULL,
  "event_type" "member_auth_event_type" NOT NULL,
  "message" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "member_auth_events_org_member_created_idx" ON "member_auth_events" ("org_id", "member_id", "created_at");
CREATE INDEX "member_auth_events_org_event_type_idx" ON "member_auth_events" ("org_id", "event_type");

CREATE TABLE "workspace_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "refresh_token_encrypted" text NOT NULL,
  "access_token" text,
  "access_token_expires_at" timestamp with time zone,
  "scope" text,
  "granted_by_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "granted_by_email" text,
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "workspace_connections_org_idx" ON "workspace_connections" ("org_id");

CREATE TABLE "email_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "direction" "email_direction" NOT NULL DEFAULT 'outbound',
  "kind" "email_kind" NOT NULL,
  "current_status" "email_activity_status" NOT NULL,
  "member_id" uuid REFERENCES "tenant_members" ("id") ON DELETE SET NULL,
  "invite_id" uuid REFERENCES "member_invites" ("id") ON DELETE SET NULL,
  "resend_of_email_activity_id" uuid,
  "actor_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "provider_email_id" text,
  "from_email" text NOT NULL,
  "to_email" text NOT NULL,
  "to_name" text,
  "subject" text NOT NULL,
  "provider_event_type" text,
  "last_error" text,
  "problem_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "bounced_at" timestamp with time zone,
  "complained_at" timestamp with time zone,
  "suppressed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_status_at" timestamp with time zone NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "email_activities_provider_email_idx" ON "email_activities" ("provider_email_id") WHERE provider_email_id IS NOT NULL;
CREATE INDEX "email_activities_org_status_idx" ON "email_activities" ("org_id", "current_status");
CREATE INDEX "email_activities_org_kind_idx" ON "email_activities" ("org_id", "kind");
CREATE INDEX "email_activities_org_sent_idx" ON "email_activities" ("org_id", "sent_at");
CREATE INDEX "email_activities_org_member_idx" ON "email_activities" ("org_id", "member_id");

CREATE TABLE "email_activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "email_activity_id" uuid NOT NULL REFERENCES "email_activities" ("id") ON DELETE CASCADE,
  "actor_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "event_type" "email_activity_event_type" NOT NULL,
  "provider_event_type" text,
  "message" text,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "email_activity_events_activity_occurred_idx" ON "email_activity_events" ("email_activity_id", "occurred_at");
CREATE INDEX "email_activity_events_org_occurred_idx" ON "email_activity_events" ("org_id", "occurred_at");

CREATE TABLE "member_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "tenant_members" ("id") ON DELETE CASCADE,
  "type" "member_payment_type" NOT NULL DEFAULT 'membership_fee',
  "status" "member_payment_status" NOT NULL DEFAULT 'pending',
  "amount" integer NOT NULL,
  "currency" text NOT NULL,
  "bank_account" text,
  "period_label" text NOT NULL,
  "period_key" text NOT NULL,
  "variable_symbol" text,
  "due_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "confirmed_by_user_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "admin_note" text,
  "cancellation_reason" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_payments_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "member_payments_org_member_idx" ON "member_payments" ("org_id", "member_id");
CREATE INDEX "member_payments_org_status_idx" ON "member_payments" ("org_id", "status");
CREATE INDEX "member_payments_org_period_key_idx" ON "member_payments" ("org_id", "period_key");
CREATE UNIQUE INDEX "member_payments_member_period_key_idx" ON "member_payments" ("member_id", "period_key");
CREATE INDEX "member_payments_org_vs_idx" ON "member_payments" ("org_id", "variable_symbol");
CREATE INDEX "member_payments_member_status_idx" ON "member_payments" ("member_id", "status");
CREATE INDEX "member_payments_org_due_at_idx" ON "member_payments" ("org_id", "due_at");

-- ═══ Create updated_at trigger (DB-level safety net) ═══

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at'
      AND table_schema = 'public'
      AND table_name NOT IN ('_drizzle_migrations')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t
    );
  END LOOP;
END;
$$;
