CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('sync', 'shared', 'group');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'sync', 'shared', 'group');--> statement-breakpoint
CREATE TYPE "public"."worker_state" AS ENUM('doing', 'done');--> statement-breakpoint
CREATE TABLE "contact_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contact_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_groups_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "contact_groups_name_not_empty_check" CHECK (char_length(btrim("contact_groups"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_owner_id_contact_id_pk" PRIMARY KEY("owner_id","contact_id"),
	CONSTRAINT "contacts_not_self_check" CHECK ("contacts"."owner_id" <> "contacts"."contact_id")
);
--> statement-breakpoint
CREATE TABLE "default_share_groups" (
	"owner_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "default_share_groups_owner_id_group_id_pk" PRIMARY KEY("owner_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "default_share_users" (
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "default_share_users_owner_id_user_id_pk" PRIMARY KEY("owner_id","user_id"),
	CONSTRAINT "default_share_users_not_self_check" CHECK ("default_share_users"."owner_id" <> "default_share_users"."user_id")
);
--> statement-breakpoint
CREATE TABLE "dialog_read_state" (
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_user_messages_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dialog_read_state_todo_id_user_id_pk" PRIMARY KEY("todo_id","user_id"),
	CONSTRAINT "dialog_read_state_count_check" CHECK ("dialog_read_state"."read_user_messages_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_image_markups" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_image_markups_version_check" CHECK ("message_image_markups"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "message_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_images_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "message_images_width_check" CHECK ("message_images"."width" > 0),
	CONSTRAINT "message_images_height_check" CHECK ("message_images"."height" > 0),
	CONSTRAINT "message_images_size_check" CHECK ("message_images"."size_bytes" > 0),
	CONSTRAINT "message_images_sort_order_check" CHECK ("message_images"."sort_order" >= 0),
	CONSTRAINT "message_images_mime_type_check" CHECK (char_length(btrim("message_images"."mime_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"author_id" uuid,
	"type" "message_type" NOT NULL,
	"text" text,
	"event_type" text,
	"event_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_payload_by_type_check" CHECK (("messages"."type" = 'user' and "messages"."text" is not null and char_length(btrim("messages"."text")) > 0 and "messages"."event_type" is null and "messages"."event_data" is null) or ("messages"."type" = 'system' and "messages"."event_type" is not null and char_length(btrim("messages"."event_type")) > 0))
);
--> statement-breakpoint
CREATE TABLE "removed_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "removed_contacts_not_self_check" CHECK ("removed_contacts"."owner_id" <> "removed_contacts"."user_id")
);
--> statement-breakpoint
CREATE TABLE "sponsored_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid NOT NULL,
	"beneficiary_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	CONSTRAINT "sponsored_subscriptions_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "sponsored_subscriptions_not_self_check" CHECK ("sponsored_subscriptions"."payer_id" <> "sponsored_subscriptions"."beneficiary_id"),
	CONSTRAINT "sponsored_subscriptions_active_check" CHECK (("sponsored_subscriptions"."active" and "sponsored_subscriptions"."stopped_at" is null) or (not "sponsored_subscriptions"."active" and "sponsored_subscriptions"."stopped_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_period_check" CHECK ("subscriptions"."current_period_end" > "subscriptions"."current_period_start"),
	CONSTRAINT "subscriptions_provider_check" CHECK (char_length(btrim("subscriptions"."provider")) > 0),
	CONSTRAINT "subscriptions_provider_subscription_id_check" CHECK (char_length(btrim("subscriptions"."provider_subscription_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "todo_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "todo_access_requests_resolution_check" CHECK (("todo_access_requests"."status" = 'pending' and "todo_access_requests"."resolved_at" is null) or ("todo_access_requests"."status" <> 'pending' and "todo_access_requests"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "todo_group_access" (
	"todo_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_group_access_todo_id_group_id_pk" PRIMARY KEY("todo_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "todo_image_markups" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_image_markups_version_check" CHECK ("todo_image_markups"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "todo_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_images_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "todo_images_width_check" CHECK ("todo_images"."width" > 0),
	CONSTRAINT "todo_images_height_check" CHECK ("todo_images"."height" > 0),
	CONSTRAINT "todo_images_size_check" CHECK ("todo_images"."size_bytes" > 0),
	CONSTRAINT "todo_images_sort_order_check" CHECK ("todo_images"."sort_order" >= 0),
	CONSTRAINT "todo_images_mime_type_check" CHECK (char_length(btrim("todo_images"."mime_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "todo_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_share_links_todo_id_unique" UNIQUE("todo_id"),
	CONSTRAINT "todo_share_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "todo_share_links_token_hash_check" CHECK (char_length("todo_share_links"."token_hash") > 0)
);
--> statement-breakpoint
CREATE TABLE "todo_user_access" (
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_user_access_todo_id_user_id_pk" PRIMARY KEY("todo_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "todo_workers" (
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "worker_state" DEFAULT 'doing' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "todo_workers_todo_id_user_id_pk" PRIMARY KEY("todo_id","user_id"),
	CONSTRAINT "todo_workers_finished_state_check" CHECK (("todo_workers"."state" = 'doing' and "todo_workers"."finished_at" is null) or ("todo_workers"."state" = 'done' and "todo_workers"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" "todo_status" DEFAULT 'active' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"is_automatic" boolean DEFAULT false NOT NULL,
	"user_message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "todos_text_not_empty_check" CHECK (char_length(btrim("todos"."text")) > 0),
	CONSTRAINT "todos_user_message_count_check" CHECK ("todos"."user_message_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"plan" "user_plan" DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"hard_delete_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_hard_delete_schedule_check" CHECK (("users"."deleted_at" is null and "users"."hard_delete_after" is null) or ("users"."deleted_at" is not null and "users"."hard_delete_after" >= "users"."deleted_at"))
);
--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_id_users_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_share_groups" ADD CONSTRAINT "default_share_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_share_groups" ADD CONSTRAINT "default_share_groups_owned_group_fk" FOREIGN KEY ("owner_id","group_id") REFERENCES "public"."contact_groups"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_share_users" ADD CONSTRAINT "default_share_users_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_share_users" ADD CONSTRAINT "default_share_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialog_read_state" ADD CONSTRAINT "dialog_read_state_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialog_read_state" ADD CONSTRAINT "dialog_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_markups" ADD CONSTRAINT "message_image_markups_image_id_message_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."message_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_images" ADD CONSTRAINT "message_images_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_contacts" ADD CONSTRAINT "removed_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_contacts" ADD CONSTRAINT "removed_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_subscriptions" ADD CONSTRAINT "sponsored_subscriptions_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_subscriptions" ADD CONSTRAINT "sponsored_subscriptions_beneficiary_id_users_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_subscriptions" ADD CONSTRAINT "sponsored_subscriptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_access_requests" ADD CONSTRAINT "todo_access_requests_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_access_requests" ADD CONSTRAINT "todo_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_group_access" ADD CONSTRAINT "todo_group_access_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_group_access" ADD CONSTRAINT "todo_group_access_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_image_markups" ADD CONSTRAINT "todo_image_markups_image_id_todo_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."todo_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_images" ADD CONSTRAINT "todo_images_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_share_links" ADD CONSTRAINT "todo_share_links_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_user_access" ADD CONSTRAINT "todo_user_access_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_user_access" ADD CONSTRAINT "todo_user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_user_access" ADD CONSTRAINT "todo_user_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_workers" ADD CONSTRAINT "todo_workers_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_workers" ADD CONSTRAINT "todo_workers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_group_members_user_group_idx" ON "contact_group_members" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "contact_groups_owner_idx" ON "contact_groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_contact_idx" ON "contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "dialog_read_state_user_idx" ON "dialog_read_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_images_message_sort_idx" ON "message_images" USING btree ("message_id","sort_order");--> statement-breakpoint
CREATE INDEX "messages_todo_created_idx" ON "messages" USING btree ("todo_id","created_at");--> statement-breakpoint
CREATE INDEX "removed_contacts_history_idx" ON "removed_contacts" USING btree ("owner_id","user_id","removed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sponsored_subscriptions_payer_active_idx" ON "sponsored_subscriptions" USING btree ("payer_id","active");--> statement-breakpoint
CREATE INDEX "sponsored_subscriptions_beneficiary_active_idx" ON "sponsored_subscriptions" USING btree ("beneficiary_id","active");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_id_unique" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "todo_access_requests_pending_unique" ON "todo_access_requests" USING btree ("todo_id","requester_id") WHERE "todo_access_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "todo_access_requests_todo_status_idx" ON "todo_access_requests" USING btree ("todo_id","status");--> statement-breakpoint
CREATE INDEX "todo_access_requests_requester_status_idx" ON "todo_access_requests" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "todo_group_access_group_todo_idx" ON "todo_group_access" USING btree ("group_id","todo_id");--> statement-breakpoint
CREATE INDEX "todo_images_todo_sort_idx" ON "todo_images" USING btree ("todo_id","sort_order");--> statement-breakpoint
CREATE INDEX "todo_user_access_user_todo_idx" ON "todo_user_access" USING btree ("user_id","todo_id");--> statement-breakpoint
CREATE INDEX "todo_workers_todo_idx" ON "todo_workers" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "todos_owner_status_idx" ON "todos" USING btree ("owner_id","status");