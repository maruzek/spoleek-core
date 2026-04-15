CREATE TYPE "public"."member_custom_field_stage" AS ENUM('registration', 'post_approval', 'optional');--> statement-breakpoint
CREATE TYPE "public"."member_custom_field_type" AS ENUM('text', 'textarea', 'boolean', 'number', 'email', 'phone', 'date', 'select', 'multi_select');--> statement-breakpoint
CREATE TABLE "member_custom_field_values" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"member_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value_text" text,
	"value_number" integer,
	"value_boolean" boolean,
	"value_date" timestamp with time zone,
	"value_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_custom_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"type" "member_custom_field_type" NOT NULL,
	"stage" "member_custom_field_stage" DEFAULT 'optional' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "tenant_members"
SET
	"first_name" = CASE
		WHEN POSITION(' ' IN TRIM("full_name")) = 0 THEN TRIM("full_name")
		ELSE REGEXP_REPLACE(TRIM("full_name"), '\s+\S+$', '')
	END,
	"last_name" = CASE
		WHEN POSITION(' ' IN TRIM("full_name")) = 0 THEN ''
		ELSE REGEXP_REPLACE(TRIM("full_name"), '^.*\s+', '')
	END
WHERE TRIM(COALESCE("full_name", '')) <> '';--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ADD CONSTRAINT "member_custom_field_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ADD CONSTRAINT "member_custom_field_values_member_id_tenant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_custom_field_values" ADD CONSTRAINT "member_custom_field_values_field_id_member_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."member_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_custom_fields" ADD CONSTRAINT "member_custom_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_custom_field_values_member_field_idx" ON "member_custom_field_values" USING btree ("member_id","field_id");--> statement-breakpoint
CREATE INDEX "member_custom_field_values_org_member_idx" ON "member_custom_field_values" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "member_custom_field_values_org_field_idx" ON "member_custom_field_values" USING btree ("org_id","field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_custom_fields_org_key_idx" ON "member_custom_fields" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "member_custom_fields_org_sort_idx" ON "member_custom_fields" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "member_custom_fields_org_stage_idx" ON "member_custom_fields" USING btree ("org_id","stage");
