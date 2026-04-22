ALTER TYPE "public"."membership_status" ADD VALUE 'suspended' BEFORE 'archived';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_renewal_headsup" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_renewal_headsup_days_before" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_overdue" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_payment_confirmed" boolean DEFAULT true NOT NULL;