CREATE TYPE "public"."group_page_visibility" AS ENUM('inherit', 'all_members', 'members_only');--> statement-breakpoint
CREATE TABLE "group_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_categories" ADD COLUMN "group_pages_visible_to_all_members" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "page_visibility" "group_page_visibility" DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "announcement" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "announcement_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "announcement_updated_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "show_group_rosters" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "hide_from_group_rosters" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "group_resources" ADD CONSTRAINT "group_resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_resources" ADD CONSTRAINT "group_resources_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_resources_org_group_sort_idx" ON "group_resources" USING btree ("org_id","group_id","sort_order");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_announcement_updated_by_member_id_tenant_members_id_fk" FOREIGN KEY ("announcement_updated_by_member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;