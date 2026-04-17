CREATE TYPE "public"."email_activity_event_type" AS ENUM('api_accepted', 'resend_requested', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_activity_status" AS ENUM('sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."email_kind" AS ENUM('member_activation_invite');--> statement-breakpoint
CREATE TABLE "email_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"direction" "email_direction" DEFAULT 'outbound' NOT NULL,
	"kind" "email_kind" NOT NULL,
	"current_status" "email_activity_status" NOT NULL,
	"member_id" text,
	"invite_id" text,
	"resend_of_email_activity_id" text,
	"actor_user_id" text,
	"provider_email_id" text,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"provider_event_type" text,
	"last_error" text,
	"problem_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_status_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email_activity_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" "email_activity_event_type" NOT NULL,
	"provider_event_type" text,
	"message" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_invite_id_member_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."member_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activity_events" ADD CONSTRAINT "email_activity_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activity_events" ADD CONSTRAINT "email_activity_events_email_activity_id_email_activities_id_fk" FOREIGN KEY ("email_activity_id") REFERENCES "public"."email_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_activity_events" ADD CONSTRAINT "email_activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_activities_provider_email_idx" ON "email_activities" USING btree ("provider_email_id");--> statement-breakpoint
CREATE INDEX "email_activities_org_status_idx" ON "email_activities" USING btree ("org_id","current_status");--> statement-breakpoint
CREATE INDEX "email_activities_org_kind_idx" ON "email_activities" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "email_activities_org_sent_idx" ON "email_activities" USING btree ("org_id","sent_at");--> statement-breakpoint
CREATE INDEX "email_activities_org_member_idx" ON "email_activities" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "email_activity_events_activity_occurred_idx" ON "email_activity_events" USING btree ("email_activity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "email_activity_events_org_occurred_idx" ON "email_activity_events" USING btree ("org_id","occurred_at");