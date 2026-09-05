CREATE TYPE "public"."membership_period_mode" AS ENUM('calendar_year', 'renewal_span');--> statement-breakpoint
CREATE TYPE "public"."membership_report_confirmation_basis" AS ENUM('paid', 'waived', 'manual');--> statement-breakpoint
CREATE TYPE "public"."membership_report_group_status" AS ENUM('not_started', 'in_progress', 'submitted', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."membership_report_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "membership_report_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"status" "membership_report_group_status" DEFAULT 'not_started' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_member_id" uuid,
	"submission_note" text,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" text,
	"self_approved" boolean DEFAULT false NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_reason" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"paid_count" integer DEFAULT 0 NOT NULL,
	"waived_count" integer DEFAULT 0 NOT NULL,
	"fee_total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_report_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_group_id" uuid NOT NULL,
	"member_id" uuid,
	"first_name" text,
	"last_name" text,
	"email" text,
	"confirmation_basis" "membership_report_confirmation_basis" NOT NULL,
	"payment_id" uuid,
	"fee_amount_cents" integer,
	"currency" text,
	"included" boolean DEFAULT true NOT NULL,
	"pending_addition" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"confirm_due_at" date,
	"status" "membership_report_status" DEFAULT 'draft' NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_reports_period_bounds_check" CHECK ("membership_reports"."period_end" >= "membership_reports"."period_start")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_period_mode" "membership_period_mode" DEFAULT 'calendar_year' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_report_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_report_allow_self_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_report_id_membership_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."membership_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_submitted_by_member_id_tenant_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_members" ADD CONSTRAINT "membership_report_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_members" ADD CONSTRAINT "membership_report_members_report_group_id_membership_report_groups_id_fk" FOREIGN KEY ("report_group_id") REFERENCES "public"."membership_report_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_members" ADD CONSTRAINT "membership_report_members_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_report_members" ADD CONSTRAINT "membership_report_members_payment_id_member_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."member_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_reports" ADD CONSTRAINT "membership_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_reports" ADD CONSTRAINT "membership_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_report_groups_report_group_idx" ON "membership_report_groups" USING btree ("report_id","group_id");--> statement-breakpoint
CREATE INDEX "membership_report_groups_org_status_idx" ON "membership_report_groups" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "membership_report_groups_group_idx" ON "membership_report_groups" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_report_members_group_member_idx" ON "membership_report_members" USING btree ("report_group_id","member_id");--> statement-breakpoint
CREATE INDEX "membership_report_members_org_idx" ON "membership_report_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "membership_report_members_member_idx" ON "membership_report_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "membership_report_members_pending_idx" ON "membership_report_members" USING btree ("report_group_id") WHERE pending_addition;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_reports_org_period_idx" ON "membership_reports" USING btree ("org_id","period_label");--> statement-breakpoint
CREATE INDEX "membership_reports_org_status_idx" ON "membership_reports" USING btree ("org_id","status");