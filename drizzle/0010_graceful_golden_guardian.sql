ALTER TABLE "subscriptions" ALTER COLUMN "plan" SET DATA TYPE text;--> statement-breakpoint
UPDATE "subscriptions" SET "plan" = CASE "plan" WHEN 'sync' THEN 'cloud' WHEN 'shared' THEN 'share' ELSE "plan" END;--> statement-breakpoint
DROP TYPE "public"."subscription_plan";--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('cloud', 'join', 'share', 'group');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "plan" SET DATA TYPE "public"."subscription_plan" USING "plan"::"public"."subscription_plan";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'free'::text;--> statement-breakpoint
UPDATE "users" SET "plan" = CASE "plan" WHEN 'sync' THEN 'cloud' WHEN 'shared' THEN 'share' ELSE "plan" END;--> statement-breakpoint
DROP TYPE "public"."user_plan";--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'cloud', 'join', 'share', 'group');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'free'::"public"."user_plan";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DATA TYPE "public"."user_plan" USING "plan"::"public"."user_plan";
