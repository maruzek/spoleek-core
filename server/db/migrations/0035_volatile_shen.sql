ALTER TYPE "public"."email_kind" ADD VALUE 'registration_rejected';--> statement-breakpoint
ALTER TYPE "public"."member_auth_event_type" ADD VALUE 'member_rejected' BEFORE 'invite_send_requested';