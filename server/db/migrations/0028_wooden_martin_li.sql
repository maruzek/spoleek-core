CREATE TYPE "public"."workspace_drift_status" AS ENUM('open', 'ignored');--> statement-breakpoint
CREATE TABLE "workspace_group_drift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"workspace_group_id" text NOT NULL,
	"address" text NOT NULL,
	"role" "workspace_group_role" DEFAULT 'member' NOT NULL,
	"member_type" text DEFAULT 'USER' NOT NULL,
	"status" "workspace_drift_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_group_drift" ADD CONSTRAINT "workspace_group_drift_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_group_drift" ADD CONSTRAINT "workspace_group_drift_link_id_group_workspace_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."group_workspace_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_group_drift_link_address_idx" ON "workspace_group_drift" USING btree ("link_id","address");--> statement-breakpoint
CREATE INDEX "workspace_group_drift_org_status_idx" ON "workspace_group_drift" USING btree ("org_id","status");