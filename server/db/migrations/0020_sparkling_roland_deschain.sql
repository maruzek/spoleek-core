ALTER TABLE "member_payments" ADD COLUMN "confirmed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "member_payments" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "member_payments" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_payments_org_vs_idx" ON "member_payments" USING btree ("org_id","variable_symbol");--> statement-breakpoint
CREATE INDEX "member_payments_member_status_idx" ON "member_payments" USING btree ("member_id","status");