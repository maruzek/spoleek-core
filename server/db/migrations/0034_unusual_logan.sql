ALTER TYPE "public"."email_kind" ADD VALUE 'registration_acknowledgement';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'registration_duplicate_notice';--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "accepted_policy_version" text;