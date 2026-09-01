ALTER TABLE "users" ADD COLUMN "billing_period" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_plan" "user_plan";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_plan_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_billing_period" text;