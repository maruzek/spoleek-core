CREATE TYPE "public"."group_membership_status" AS ENUM('active', 'pending', 'declined');--> statement-breakpoint
ALTER TABLE "group_categories" ADD COLUMN "show_groups_to_non_members" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "status" "group_membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "request_message" text;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "decided_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "requests_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_join_request" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_join_decision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_decided_by_member_id_tenant_members_id_fk" FOREIGN KEY ("decided_by_member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_memberships_org_group_status_idx" ON "group_memberships" USING btree ("org_id","group_id","status");