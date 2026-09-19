ALTER TYPE "public"."email_kind" ADD VALUE 'event_payment';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'payment_confirmed';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'payment_overdue';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'payment_renewal_headsup';--> statement-breakpoint
ALTER TYPE "public"."email_kind" ADD VALUE 'password_reset';