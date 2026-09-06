CREATE TYPE "public"."policy_acknowledgement_method" AS ENUM('registration', 'portal_prompt', 'admin_recorded', 'import_notice');--> statement-breakpoint
CREATE TYPE "public"."policy_document_kind" AS ENUM('terms', 'privacy', 'other');--> statement-breakpoint
CREATE TYPE "public"."policy_version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "member_policy_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" "policy_acknowledgement_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "policy_document_kind" NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"requires_acceptance" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"summary_of_changes" text DEFAULT '' NOT NULL,
	"status" "policy_version_status" DEFAULT 'draft' NOT NULL,
	"is_material_change" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_policy_acknowledgements" ADD CONSTRAINT "member_policy_acknowledgements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_policy_acknowledgements" ADD CONSTRAINT "member_policy_acknowledgements_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_policy_acknowledgements" ADD CONSTRAINT "member_policy_acknowledgements_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_document_id_policy_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."policy_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_policy_ack_member_version_idx" ON "member_policy_acknowledgements" USING btree ("member_id","policy_version_id");--> statement-breakpoint
CREATE INDEX "member_policy_ack_org_member_idx" ON "member_policy_acknowledgements" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "member_policy_ack_version_idx" ON "member_policy_acknowledgements" USING btree ("policy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_documents_org_slug_idx" ON "policy_documents" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "policy_documents_org_active_idx" ON "policy_documents" USING btree ("org_id") WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_document_version_idx" ON "policy_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_document_draft_idx" ON "policy_versions" USING btree ("document_id") WHERE status = 'draft';--> statement-breakpoint
CREATE INDEX "policy_versions_document_status_idx" ON "policy_versions" USING btree ("document_id","status");