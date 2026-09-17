ALTER TYPE "public"."member_payment_status" ADD VALUE 'refund_due';--> statement-breakpoint
DROP INDEX "member_payments_member_period_key_idx";--> statement-breakpoint
ALTER TABLE "member_payments" ALTER COLUMN "member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "price_amount" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "price_currency" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "price_bank_account" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "payment_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_payments" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "member_payments" ADD COLUMN "response_id" uuid;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_response_id_event_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."event_responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_payments_response_live_idx" ON "member_payments" USING btree ("response_id") WHERE response_id IS NOT NULL AND status <> 'cancelled';--> statement-breakpoint
CREATE INDEX "member_payments_org_event_idx" ON "member_payments" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_payments_member_period_key_idx" ON "member_payments" USING btree ("member_id","period_key") WHERE type = 'membership_fee';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_price_amount_check" CHECK ("events"."price_amount" IS NULL OR "events"."price_amount" > 0);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_price_currency_check" CHECK (("events"."price_amount" IS NULL) = ("events"."price_currency" IS NULL));--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_type_check" CHECK (("member_payments"."type" = 'membership_fee' AND "member_payments"."member_id" IS NOT NULL AND "member_payments"."event_id" IS NULL AND "member_payments"."response_id" IS NULL) OR ("member_payments"."type" = 'event' AND "member_payments"."event_id" IS NOT NULL));