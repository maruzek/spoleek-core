CREATE TYPE "public"."membership_report_reminder_stage" AS ENUM('t_minus_14', 't_minus_7', 't_minus_1', 'overdue');--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'report_reminder';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'report_digest';--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD COLUMN "reminder_stage_sent" "membership_report_reminder_stage";--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_notify_report_reminder" boolean DEFAULT true NOT NULL;