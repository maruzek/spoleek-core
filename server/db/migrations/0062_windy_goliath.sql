CREATE TYPE "public"."form_audience_kind" AS ENUM('group', 'category', 'member');--> statement-breakpoint
CREATE TYPE "public"."form_audience_scope" AS ENUM('members', 'admins');--> statement-breakpoint
CREATE TYPE "public"."form_profile_sync" AS ENUM('none', 'offer', 'offer_checked', 'always');--> statement-breakpoint
CREATE TYPE "public"."form_question_kind" AS ENUM('input', 'section');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."form_timing" AS ENUM('after_rsvp', 'before_event', 'during_event', 'after_event', 'anytime');--> statement-breakpoint
CREATE TYPE "public"."form_visibility" AS ENUM('org', 'targeted');--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'form_reminder';--> statement-breakpoint
CREATE TABLE "form_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" jsonb,
	"encrypted_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_answers_value_check" CHECK ("form_answers"."value" IS NULL OR "form_answers"."encrypted_value" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "form_audience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"kind" "form_audience_kind" NOT NULL,
	"group_id" uuid,
	"category_id" uuid,
	"member_id" uuid,
	"scope" "form_audience_scope" DEFAULT 'members' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_audience_kind_check" CHECK (("form_audience"."kind" = 'group' AND "form_audience"."group_id" IS NOT NULL AND "form_audience"."category_id" IS NULL AND "form_audience"."member_id" IS NULL) OR ("form_audience"."kind" = 'category' AND "form_audience"."category_id" IS NOT NULL AND "form_audience"."group_id" IS NULL AND "form_audience"."member_id" IS NULL) OR ("form_audience"."kind" = 'member' AND "form_audience"."member_id" IS NOT NULL AND "form_audience"."group_id" IS NULL AND "form_audience"."category_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "form_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" "form_question_kind" NOT NULL,
	"label" text NOT NULL,
	"description_html" text,
	"type" "member_custom_field_type",
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"member_field_id" uuid,
	"profile_sync" "form_profile_sync" DEFAULT 'none' NOT NULL,
	"sensitivity" "member_custom_field_sensitivity" DEFAULT 'normal' NOT NULL,
	"art9_condition" "member_custom_field_art9_condition",
	"processing_purpose" text,
	"value_visibility" "member_custom_field_visibility" DEFAULT 'member_managers' NOT NULL,
	"shred_after_event_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_questions_sort_order_check" CHECK ("form_questions"."sort_order" >= 0),
	CONSTRAINT "form_questions_type_check" CHECK ("form_questions"."kind" = 'section' OR "form_questions"."type" IS NOT NULL),
	CONSTRAINT "form_questions_profile_sync_check" CHECK ("form_questions"."profile_sync" = 'none' OR "form_questions"."member_field_id" IS NOT NULL),
	CONSTRAINT "form_questions_art9_check" CHECK ("form_questions"."sensitivity" = 'normal' OR ("form_questions"."art9_condition" IS NOT NULL AND "form_questions"."processing_purpose" IS NOT NULL)),
	CONSTRAINT "form_questions_special_category_check" CHECK ("form_questions"."sensitivity" = 'normal' OR ("form_questions"."member_field_id" IS NULL AND "form_questions"."shred_after_event_days" IS NOT NULL)),
	CONSTRAINT "form_questions_shred_days_check" CHECK ("form_questions"."shred_after_event_days" IS NULL OR "form_questions"."shred_after_event_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"member_id" uuid,
	"guest_email" text,
	"guest_name" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_user_id" text,
	"shredded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_submissions_submitter_check" CHECK ("form_submissions"."member_id" IS NULL OR "form_submissions"."guest_email" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_template" boolean DEFAULT false NOT NULL,
	"owner_type" "event_owner_type" NOT NULL,
	"owner_category_id" uuid,
	"owner_group_id" uuid,
	"event_id" uuid,
	"timing" "form_timing" DEFAULT 'anytime' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"only_rsvp_yes" boolean DEFAULT false NOT NULL,
	"closes_at" timestamp with time zone,
	"visibility" "form_visibility" DEFAULT 'org' NOT NULL,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forms_owner_check" CHECK (("forms"."owner_type" = 'organization' AND "forms"."owner_category_id" IS NULL AND "forms"."owner_group_id" IS NULL) OR ("forms"."owner_type" = 'category' AND "forms"."owner_category_id" IS NOT NULL AND "forms"."owner_group_id" IS NULL) OR ("forms"."owner_type" = 'group' AND "forms"."owner_group_id" IS NOT NULL AND "forms"."owner_category_id" IS NULL)),
	CONSTRAINT "forms_template_owner_check" CHECK ("forms"."is_template" = false OR "forms"."owner_type" = 'organization'),
	CONSTRAINT "forms_template_event_check" CHECK ("forms"."is_template" = false OR "forms"."event_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_question_id_form_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_audience" ADD CONSTRAINT "form_audience_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_audience" ADD CONSTRAINT "form_audience_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_audience" ADD CONSTRAINT "form_audience_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_audience" ADD CONSTRAINT "form_audience_category_id_group_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_audience" ADD CONSTRAINT "form_audience_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_member_field_id_member_custom_fields_id_fk" FOREIGN KEY ("member_field_id") REFERENCES "public"."member_custom_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_category_id_group_categories_id_fk" FOREIGN KEY ("owner_category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_group_id_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_answers_submission_question_idx" ON "form_answers" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE INDEX "form_answers_org_question_idx" ON "form_answers" USING btree ("org_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_audience_form_group_idx" ON "form_audience" USING btree ("form_id","group_id","scope") WHERE kind = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "form_audience_form_category_idx" ON "form_audience" USING btree ("form_id","category_id","scope") WHERE kind = 'category';--> statement-breakpoint
CREATE UNIQUE INDEX "form_audience_form_member_idx" ON "form_audience" USING btree ("form_id","member_id") WHERE kind = 'member';--> statement-breakpoint
CREATE INDEX "form_audience_org_form_idx" ON "form_audience" USING btree ("org_id","form_id");--> statement-breakpoint
CREATE INDEX "form_audience_member_idx" ON "form_audience" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "form_questions_form_sort_idx" ON "form_questions" USING btree ("form_id","sort_order");--> statement-breakpoint
CREATE INDEX "form_questions_org_member_field_idx" ON "form_questions" USING btree ("org_id","member_field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_form_member_idx" ON "form_submissions" USING btree ("form_id","member_id") WHERE member_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_form_guest_email_idx" ON "form_submissions" USING btree ("form_id",lower("guest_email")) WHERE guest_email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "form_submissions_org_form_idx" ON "form_submissions" USING btree ("org_id","form_id");--> statement-breakpoint
CREATE INDEX "form_submissions_org_member_idx" ON "form_submissions" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "forms_org_event_idx" ON "forms" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "forms_org_template_idx" ON "forms" USING btree ("org_id","is_template");--> statement-breakpoint
CREATE INDEX "forms_org_status_idx" ON "forms" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "forms_org_owner_group_idx" ON "forms" USING btree ("org_id","owner_group_id");--> statement-breakpoint
CREATE INDEX "forms_org_owner_category_idx" ON "forms" USING btree ("org_id","owner_category_id");