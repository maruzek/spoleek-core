CREATE TYPE "public"."group_category_selection_mode" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "public"."group_join_policy" AS ENUM('admin_only', 'free_join_leave', 'request_to_join');--> statement-breakpoint
CREATE TYPE "public"."group_membership_role" AS ENUM('member', 'group_admin');--> statement-breakpoint
CREATE TABLE "category_admin_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"category_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_pinned_to_navigation" boolean DEFAULT false NOT NULL,
	"show_in_registration" boolean DEFAULT false NOT NULL,
	"selection_mode" "group_category_selection_mode" DEFAULT 'multiple' NOT NULL,
	"selection_required" boolean DEFAULT false NOT NULL,
	"max_selections" integer,
	"default_join_policy" "group_join_policy" DEFAULT 'admin_only' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"special_capability" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"role" "group_membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"join_policy" "group_join_policy" DEFAULT 'admin_only' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ADD CONSTRAINT "category_admin_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ADD CONSTRAINT "category_admin_assignments_category_id_group_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_admin_assignments" ADD CONSTRAINT "category_admin_assignments_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_category_id_group_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_admin_assignments_category_member_idx" ON "category_admin_assignments" USING btree ("category_id","member_id");--> statement-breakpoint
CREATE INDEX "category_admin_assignments_org_category_idx" ON "category_admin_assignments" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "category_admin_assignments_org_member_idx" ON "category_admin_assignments" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_categories_org_slug_idx" ON "group_categories" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "group_categories_org_sort_idx" ON "group_categories" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "group_categories_org_active_idx" ON "group_categories" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "group_memberships_group_member_idx" ON "group_memberships" USING btree ("group_id","member_id");--> statement-breakpoint
CREATE INDEX "group_memberships_org_member_idx" ON "group_memberships" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "group_memberships_org_group_role_idx" ON "group_memberships" USING btree ("org_id","group_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_org_slug_idx" ON "groups" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "groups_category_sort_idx" ON "groups" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "groups_org_category_idx" ON "groups" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "groups_org_active_idx" ON "groups" USING btree ("org_id","is_active");