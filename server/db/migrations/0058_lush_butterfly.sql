CREATE TYPE "public"."member_deletion_reason" AS ENUM('admin_request', 'member_request', 'aged_out', 'system');--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "previous_status" "membership_status";--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "deletion_reason" "member_deletion_reason";--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "workspace_purge_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "workspace_purge_last_error" text;--> statement-breakpoint
CREATE INDEX "tenant_members_purge_idx" ON "tenant_members" USING btree ("purge_after") WHERE status = 'deleted';