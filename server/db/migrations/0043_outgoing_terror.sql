ALTER TABLE "membership_report_groups" DROP CONSTRAINT "membership_report_groups_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_report_groups" ALTER COLUMN "group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_report_groups" ADD CONSTRAINT "membership_report_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;