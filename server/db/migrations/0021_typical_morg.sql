CREATE TYPE "public"."member_preferred_email" AS ENUM('personal', 'workspace');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_email_preference" "member_preferred_email" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "preferred_email" "member_preferred_email";