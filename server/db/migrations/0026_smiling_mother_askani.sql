CREATE TYPE "public"."workspace_group_role" AS ENUM('member', 'manager', 'owner');--> statement-breakpoint
CREATE TYPE "public"."workspace_link_direction" AS ENUM('push', 'observe');--> statement-breakpoint
CREATE TYPE "public"."workspace_link_removal_policy" AS ENUM('remove_owned', 'remove_all', 'keep');--> statement-breakpoint
CREATE TYPE "public"."workspace_link_sync_status" AS ENUM('never', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."workspace_sync_operation_kind" AS ENUM('add_member', 'remove_member', 'update_role');--> statement-breakpoint
CREATE TYPE "public"."workspace_sync_operation_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "group_workspace_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"workspace_group_id" text NOT NULL,
	"workspace_group_email" text NOT NULL,
	"workspace_group_name" text,
	"direction" "workspace_link_direction" DEFAULT 'push' NOT NULL,
	"member_role" "workspace_group_role" DEFAULT 'member' NOT NULL,
	"admin_role" "workspace_group_role" DEFAULT 'manager' NOT NULL,
	"removal_policy" "workspace_link_removal_policy" DEFAULT 'remove_owned' NOT NULL,
	"include_external" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" "workspace_link_sync_status" DEFAULT 'never' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_group_member_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"workspace_group_id" text NOT NULL,
	"address" text NOT NULL,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"kind" "workspace_sync_operation_kind" NOT NULL,
	"address" text NOT NULL,
	"role" "workspace_group_role",
	"member_id" uuid,
	"status" "workspace_sync_operation_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_workspace_links" ADD CONSTRAINT "group_workspace_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_workspace_links" ADD CONSTRAINT "group_workspace_links_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_group_member_links" ADD CONSTRAINT "workspace_group_member_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_group_member_links" ADD CONSTRAINT "workspace_group_member_links_link_id_group_workspace_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."group_workspace_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_group_member_links" ADD CONSTRAINT "workspace_group_member_links_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sync_operations" ADD CONSTRAINT "workspace_sync_operations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sync_operations" ADD CONSTRAINT "workspace_sync_operations_link_id_group_workspace_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."group_workspace_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sync_operations" ADD CONSTRAINT "workspace_sync_operations_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_workspace_links_group_target_idx" ON "group_workspace_links" USING btree ("group_id","workspace_group_id");--> statement-breakpoint
CREATE INDEX "group_workspace_links_org_target_idx" ON "group_workspace_links" USING btree ("org_id","workspace_group_id");--> statement-breakpoint
CREATE INDEX "group_workspace_links_org_group_idx" ON "group_workspace_links" USING btree ("org_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_group_member_links_link_address_idx" ON "workspace_group_member_links" USING btree ("link_id","address");--> statement-breakpoint
CREATE INDEX "workspace_group_member_links_org_target_idx" ON "workspace_group_member_links" USING btree ("org_id","workspace_group_id");--> statement-breakpoint
CREATE INDEX "workspace_sync_operations_due_idx" ON "workspace_sync_operations" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "workspace_sync_operations_link_idx" ON "workspace_sync_operations" USING btree ("link_id","status");--> statement-breakpoint
CREATE INDEX "workspace_sync_operations_org_idx" ON "workspace_sync_operations" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "groups" DROP COLUMN "workspace_group_email";