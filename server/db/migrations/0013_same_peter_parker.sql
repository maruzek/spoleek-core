ALTER TYPE "public"."email_kind" ADD VALUE 'workspace_welcome';--> statement-breakpoint
ALTER TYPE "public"."member_auth_event_type" ADD VALUE 'workspace_provisioned';--> statement-breakpoint
ALTER TYPE "public"."member_auth_event_type" ADD VALUE 'workspace_provision_failed';--> statement-breakpoint
CREATE TABLE "workspace_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"granted_by_user_id" text,
	"granted_by_email" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workspace_module_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workspace_email_template" text DEFAULT '{first}.{last}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workspace_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workspace_admin_email" text;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "workspace_user_email" text;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "workspace_provisioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_connections" ADD CONSTRAINT "workspace_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_connections" ADD CONSTRAINT "workspace_connections_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_connections_org_idx" ON "workspace_connections" USING btree ("org_id");