DROP INDEX "member_payments_org_period_idx";--> statement-breakpoint
DROP INDEX "email_activities_provider_email_idx";--> statement-breakpoint
DROP INDEX "member_invites_provider_email_idx";--> statement-breakpoint
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
ALTER TABLE "groups" ADD COLUMN "workspace_group_email" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "workspace_org_unit_path" text;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ADD COLUMN "value" jsonb;--> statement-breakpoint
CREATE INDEX "member_payments_org_period_key_idx" ON "member_payments" USING btree ("org_id","period_key");--> statement-breakpoint
CREATE INDEX "member_payments_org_due_at_idx" ON "member_payments" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX "tenant_members_user_idx" ON "tenant_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenant_members_active_idx" ON "tenant_members" USING btree ("org_id","status") WHERE status != 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX "email_activities_provider_email_idx" ON "email_activities" USING btree ("provider_email_id") WHERE provider_email_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "member_invites_provider_email_idx" ON "member_invites" USING btree ("provider_email_id") WHERE provider_email_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN "value_text";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN "value_number";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN "value_boolean";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN "value_date";--> statement-breakpoint
ALTER TABLE "member_custom_field_values" DROP COLUMN "value_json";--> statement-breakpoint
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_max_selections_check" CHECK ("group_categories"."max_selections" IS NULL OR "group_categories"."max_selections" >= 1);--> statement-breakpoint
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_sort_order_check" CHECK ("group_categories"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_fee_renewal_month_check" CHECK ("groups"."fee_renewal_month" IS NULL OR ("groups"."fee_renewal_month" >= 1 AND "groups"."fee_renewal_month" <= 12));--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_fee_renewal_day_check" CHECK ("groups"."fee_renewal_day" IS NULL OR ("groups"."fee_renewal_day" >= 1 AND "groups"."fee_renewal_day" <= 31));--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_fee_amount_check" CHECK ("groups"."fee_amount" IS NULL OR "groups"."fee_amount" > 0);--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_sort_order_check" CHECK ("groups"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD CONSTRAINT "member_custom_fields_sort_order_check" CHECK ("member_custom_fields"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_amount_check" CHECK ("member_payments"."amount" > 0);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_renewal_month_check" CHECK ("organizations"."membership_renewal_month" IS NULL OR ("organizations"."membership_renewal_month" >= 1 AND "organizations"."membership_renewal_month" <= 12));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_renewal_day_check" CHECK ("organizations"."membership_renewal_day" IS NULL OR ("organizations"."membership_renewal_day" >= 1 AND "organizations"."membership_renewal_day" <= 31));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_fee_amount_check" CHECK ("organizations"."membership_fee_amount" IS NULL OR "organizations"."membership_fee_amount" > 0);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_payment_window_check" CHECK ("organizations"."membership_fee_payment_window_days" >= 1);