CREATE TYPE "public"."membership_management_mode" AS ENUM('none', 'periodic_renewal');--> statement-breakpoint
ALTER TABLE "group_categories" ADD COLUMN "manages_membership_fees" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_renewal_month" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_renewal_day" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_amount" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_currency" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "fee_bank_account" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_management_mode" "membership_management_mode" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_renewal_month" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_renewal_day" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_fee_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_fee_amount" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_fee_currency" text DEFAULT 'CZK' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "membership_fee_bank_account" text;