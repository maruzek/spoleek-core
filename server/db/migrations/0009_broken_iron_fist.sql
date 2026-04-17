CREATE TYPE "public"."member_auth_event_type" AS ENUM('member_approved', 'invite_send_requested', 'invite_sent', 'invite_send_skipped', 'invite_delivery_updated', 'invite_completed', 'activation_attempt_blocked', 'password_reset_sent');--> statement-breakpoint
CREATE TYPE "public"."member_invite_delivery_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed');--> statement-breakpoint
CREATE TABLE "member_auth_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"actor_user_id" text,
	"invite_id" text,
	"event_type" "member_auth_event_type" NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "provisioned_user_id" text;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "claimed_user_id" text;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "delivery_status" "member_invite_delivery_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "provider_email_id" text;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "resend_available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "delivery_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "last_delivery_event" text;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "activation_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "last_activation_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_invites" ADD COLUMN "activation_blocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_auth_events" ADD CONSTRAINT "member_auth_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_auth_events" ADD CONSTRAINT "member_auth_events_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_auth_events" ADD CONSTRAINT "member_auth_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_auth_events" ADD CONSTRAINT "member_auth_events_invite_id_member_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."member_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_auth_events_org_member_created_idx" ON "member_auth_events" USING btree ("org_id","member_id","created_at");--> statement-breakpoint
CREATE INDEX "member_auth_events_org_event_type_idx" ON "member_auth_events" USING btree ("org_id","event_type");--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_provisioned_user_id_users_id_fk" FOREIGN KEY ("provisioned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_invites_provider_email_idx" ON "member_invites" USING btree ("provider_email_id");--> statement-breakpoint
CREATE INDEX "member_invites_org_delivery_status_idx" ON "member_invites" USING btree ("org_id","delivery_status");