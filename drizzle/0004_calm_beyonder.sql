CREATE TABLE "todo_access_revocations" (
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_access_revocations_todo_id_user_id_pk" PRIMARY KEY("todo_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "todo_user_access" RENAME COLUMN "granted_at" TO "created_at";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'free'::text;--> statement-breakpoint
DROP TYPE "public"."user_plan";--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'sync', 'shared');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'free'::"public"."user_plan";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan" SET DATA TYPE "public"."user_plan" USING "plan"::"public"."user_plan";--> statement-breakpoint
ALTER TABLE "todo_access_revocations" ADD CONSTRAINT "todo_access_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_access_revocations_user_idx" ON "todo_access_revocations" USING btree ("user_id","revoked_at");
