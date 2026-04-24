DROP INDEX IF EXISTS "member_payments_org_period_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "email_activities_provider_email_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "member_invites_provider_email_idx";--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "invite_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activities" ALTER COLUMN "resend_of_email_activity_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activity_events" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activity_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "email_activity_events" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "email_activity_events" ALTER COLUMN "email_activity_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_categories" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_categories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "group_categories" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_memberships" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_memberships" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "group_memberships" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_memberships" ALTER COLUMN "group_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "group_memberships" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "category_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_auth_events" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_auth_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member_auth_events" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_auth_events" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_auth_events" ALTER COLUMN "invite_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ALTER COLUMN "field_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member_custom_fields" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_invites" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_invites" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member_invites" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_invites" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_payments" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_payments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "member_payments" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "member_payments" ALTER COLUMN "member_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_policies" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organization_policies" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "organization_policies" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "tenant_members" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tenant_members" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "tenant_members" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspace_connections" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspace_connections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "workspace_connections" ALTER COLUMN "org_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "workspace_group_email" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "workspace_org_unit_path" text;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ADD COLUMN IF NOT EXISTS "value" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "email_activities_provider_email_idx" ON "email_activities" USING btree ("provider_email_id") WHERE provider_email_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "member_invites_provider_email_idx" ON "member_invites" USING btree ("provider_email_id") WHERE provider_email_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN IF EXISTS "value_text";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN IF EXISTS "value_number";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN IF EXISTS "value_boolean";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN IF EXISTS "value_date";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN IF EXISTS "value_json";--> statement-breakpoint
