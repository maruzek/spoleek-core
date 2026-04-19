CREATE TYPE "public"."member_payment_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."member_payment_type" AS ENUM('membership_fee', 'event');--> statement-breakpoint
CREATE TABLE "member_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"type" "member_payment_type" DEFAULT 'membership_fee' NOT NULL,
	"status" "member_payment_status" DEFAULT 'pending' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"bank_account" text,
	"period_label" text NOT NULL,
	"period_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_payment_window_days" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_fee_payment_window_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_payments_org_member_idx" ON "member_payments" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "member_payments_org_status_idx" ON "member_payments" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "member_payments_org_period_idx" ON "member_payments" USING btree ("org_id","period_label");--> statement-breakpoint
CREATE UNIQUE INDEX "member_payments_member_period_key_idx" ON "member_payments" USING btree ("member_id","period_key");