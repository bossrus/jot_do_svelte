CREATE TYPE "public"."friend_request_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"status" "friend_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_requests_not_self_check" CHECK ("friend_requests"."sender_user_id" <> "friend_requests"."recipient_user_id")
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_sender_recipient_unique" ON "friend_requests" USING btree ("sender_user_id","recipient_user_id") WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_status_idx" ON "friend_requests" USING btree ("recipient_user_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_sender_status_idx" ON "friend_requests" USING btree ("sender_user_id","status");