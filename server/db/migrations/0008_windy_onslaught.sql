CREATE TYPE "public"."member_invite_status" AS ENUM('pending', 'sent', 'completed', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "member_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" "member_invite_status" DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"reset_token_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_policies" ADD COLUMN "member_invite_email_subject" text DEFAULT 'Your membership has been approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD COLUMN "member_invite_email_body" text DEFAULT 'Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_invites_member_idx" ON "member_invites" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_invites_org_status_idx" ON "member_invites" USING btree ("org_id","status");