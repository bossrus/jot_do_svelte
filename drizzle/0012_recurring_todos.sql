CREATE TYPE "public"."recurring_frequency" AS ENUM('daily', 'weekdays', 'interval_days', 'interval_weeks', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."recurring_occurrence_status" AS ENUM('processing', 'created', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "recurring_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "owner_id" uuid NOT NULL, "enabled" boolean DEFAULT true NOT NULL,
	"frequency" "recurring_frequency" NOT NULL, "interval" integer DEFAULT 1 NOT NULL, "weekdays" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"month_day" integer, "local_time" text NOT NULL, "timezone" text NOT NULL, "content_snapshot" jsonb NOT NULL, "settings_snapshot" jsonb NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL, "last_run_at" timestamp with time zone, "last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_templates_interval_check" CHECK ("interval" > 0)
);--> statement-breakpoint
CREATE TABLE "recurring_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "template_id" uuid NOT NULL, "scheduled_for" timestamp with time zone NOT NULL,
	"status" "recurring_occurrence_status" NOT NULL, "todo_id" uuid, "error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_occurrences_template_scheduled_unique" UNIQUE("template_id","scheduled_for")
);--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "recurring_template_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_template_id_recurring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."recurring_templates"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_recurring_template_id_recurring_templates_id_fk" FOREIGN KEY ("recurring_template_id") REFERENCES "public"."recurring_templates"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "recurring_templates_due_idx" ON "recurring_templates" USING btree ("enabled","next_run_at");
