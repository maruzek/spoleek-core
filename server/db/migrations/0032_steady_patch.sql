ALTER TYPE "public"."email_kind" ADD VALUE 'registration_submitted';--> statement-breakpoint
ALTER TABLE "group_categories" ADD COLUMN "notify_on_registration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "group_categories" ADD COLUMN "notification_email" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "notify_via_workspace_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "notification_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_registration" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "registration_notification_email" text;