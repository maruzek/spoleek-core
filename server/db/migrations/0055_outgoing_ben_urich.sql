CREATE TYPE "public"."member_custom_field_art9_condition" AS ENUM('explicit_consent', 'vital_interests', 'not_for_profit_body', 'legal_claims', 'health_care');--> statement-breakpoint
CREATE TYPE "public"."member_custom_field_sensitivity" AS ENUM('normal', 'special_category');--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD COLUMN "sensitivity" "member_custom_field_sensitivity" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD COLUMN "art9_condition" "member_custom_field_art9_condition";--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD COLUMN "processing_purpose" text;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD COLUMN "retention_months" integer;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD CONSTRAINT "member_custom_fields_special_category_check" CHECK ("member_custom_fields"."sensitivity" = 'normal' OR ("member_custom_fields"."art9_condition" IS NOT NULL AND "member_custom_fields"."processing_purpose" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD CONSTRAINT "member_custom_fields_retention_check" CHECK ("member_custom_fields"."retention_months" IS NULL OR "member_custom_fields"."retention_months" > 0);