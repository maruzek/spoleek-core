CREATE TYPE "public"."event_audience_kind" AS ENUM('group', 'category', 'member', 'external');--> statement-breakpoint
CREATE TYPE "public"."event_owner_type" AS ENUM('organization', 'category', 'group');--> statement-breakpoint
CREATE TYPE "public"."event_rsvp_answer" AS ENUM('yes', 'no', 'maybe');--> statement-breakpoint
CREATE TYPE "public"."event_rsvp_standing" AS ENUM('confirmed', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('public', 'org', 'targeted');--> statement-breakpoint
CREATE TYPE "public"."org_event_creators" AS ENUM('org_admins', 'category_admins', 'any_admin');--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'event_invite';--> statement-breakpoint
CREATE TABLE "event_audience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "event_audience_kind" NOT NULL,
	"group_id" uuid,
	"category_id" uuid,
	"member_id" uuid,
	"external_email" text,
	"external_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_audience_kind_check" CHECK (("event_audience"."kind" = 'group' AND "event_audience"."group_id" IS NOT NULL AND "event_audience"."category_id" IS NULL AND "event_audience"."member_id" IS NULL AND "event_audience"."external_email" IS NULL) OR ("event_audience"."kind" = 'category' AND "event_audience"."category_id" IS NOT NULL AND "event_audience"."group_id" IS NULL AND "event_audience"."member_id" IS NULL AND "event_audience"."external_email" IS NULL) OR ("event_audience"."kind" = 'member' AND "event_audience"."member_id" IS NOT NULL AND "event_audience"."group_id" IS NULL AND "event_audience"."category_id" IS NULL AND "event_audience"."external_email" IS NULL) OR ("event_audience"."kind" = 'external' AND "event_audience"."external_email" IS NOT NULL AND "event_audience"."group_id" IS NULL AND "event_audience"."category_id" IS NULL AND "event_audience"."member_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "event_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid,
	"guest_email" text,
	"guest_name" text,
	"answer" "event_rsvp_answer" NOT NULL,
	"guest_count" integer DEFAULT 0 NOT NULL,
	"standing" "event_rsvp_standing" DEFAULT 'confirmed' NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_responses_responder_check" CHECK ("event_responses"."member_id" IS NULL OR "event_responses"."guest_email" IS NULL),
	CONSTRAINT "event_responses_guest_count_check" CHECK ("event_responses"."guest_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_rsvp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid,
	"external_email" text,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvp_tokens_holder_check" CHECK (("event_rsvp_tokens"."member_id" IS NOT NULL AND "event_rsvp_tokens"."external_email" IS NULL) OR ("event_rsvp_tokens"."member_id" IS NULL AND "event_rsvp_tokens"."external_email" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text,
	"owner_type" "event_owner_type" NOT NULL,
	"owner_category_id" uuid,
	"owner_group_id" uuid,
	"visibility" "event_visibility" DEFAULT 'targeted' NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"rsvp_deadline_at" timestamp with time zone,
	"capacity" integer,
	"max_guests_per_response" integer DEFAULT 0 NOT NULL,
	"location_name" text,
	"location_address" text,
	"communication_link" text,
	"created_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_owner_check" CHECK (("events"."owner_type" = 'organization' AND "events"."owner_category_id" IS NULL AND "events"."owner_group_id" IS NULL) OR ("events"."owner_type" = 'category' AND "events"."owner_category_id" IS NOT NULL AND "events"."owner_group_id" IS NULL) OR ("events"."owner_type" = 'group' AND "events"."owner_group_id" IS NOT NULL AND "events"."owner_category_id" IS NULL)),
	CONSTRAINT "events_dates_check" CHECK ("events"."ends_at" IS NULL OR ("events"."starts_at" IS NOT NULL AND "events"."ends_at" >= "events"."starts_at")),
	CONSTRAINT "events_capacity_check" CHECK ("events"."capacity" IS NULL OR "events"."capacity" > 0),
	CONSTRAINT "events_max_guests_check" CHECK ("events"."max_guests_per_response" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_activities" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "org_event_creators" "org_event_creators" DEFAULT 'org_admins' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "event_guest_retention_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_category_id_group_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audience" ADD CONSTRAINT "event_audience_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_tokens" ADD CONSTRAINT "event_rsvp_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_tokens" ADD CONSTRAINT "event_rsvp_tokens_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_tokens" ADD CONSTRAINT "event_rsvp_tokens_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_category_id_group_categories_id_fk" FOREIGN KEY ("owner_category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_group_id_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_audience_event_group_idx" ON "event_audience" USING btree ("event_id","group_id") WHERE kind = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "event_audience_event_category_idx" ON "event_audience" USING btree ("event_id","category_id") WHERE kind = 'category';--> statement-breakpoint
CREATE UNIQUE INDEX "event_audience_event_member_idx" ON "event_audience" USING btree ("event_id","member_id") WHERE kind = 'member';--> statement-breakpoint
CREATE UNIQUE INDEX "event_audience_event_external_idx" ON "event_audience" USING btree ("event_id",lower("external_email")) WHERE kind = 'external';--> statement-breakpoint
CREATE INDEX "event_audience_org_event_idx" ON "event_audience" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "event_audience_member_idx" ON "event_audience" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_responses_event_member_idx" ON "event_responses" USING btree ("event_id","member_id") WHERE member_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_responses_event_guest_email_idx" ON "event_responses" USING btree ("event_id",lower("guest_email")) WHERE guest_email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "event_responses_org_event_idx" ON "event_responses" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "event_responses_member_idx" ON "event_responses" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "event_responses_event_answer_standing_idx" ON "event_responses" USING btree ("event_id","answer","standing");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_tokens_hash_idx" ON "event_rsvp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_tokens_event_member_idx" ON "event_rsvp_tokens" USING btree ("event_id","member_id") WHERE member_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_tokens_event_external_idx" ON "event_rsvp_tokens" USING btree ("event_id",lower("external_email")) WHERE external_email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "event_rsvp_tokens_org_event_idx" ON "event_rsvp_tokens" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_org_slug_idx" ON "events" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "events_org_status_starts_idx" ON "events" USING btree ("org_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "events_org_owner_group_idx" ON "events" USING btree ("org_id","owner_group_id");--> statement-breakpoint
CREATE INDEX "events_org_owner_category_idx" ON "events" USING btree ("org_id","owner_category_id");--> statement-breakpoint
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_activities_org_event_idx" ON "email_activities" USING btree ("org_id","event_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_event_guest_retention_check" CHECK ("organizations"."event_guest_retention_days" > 0);