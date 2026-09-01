CREATE TABLE "friend_request_groups" (
	"request_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "friend_request_groups_request_id_group_id_pk" PRIMARY KEY("request_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "contact_group_members" DROP CONSTRAINT "contact_group_members_group_id_contact_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "contact_group_members" AS members
SET "owner_id" = groups."owner_id"
FROM "contact_groups" AS groups
WHERE groups."id" = members."group_id";--> statement-breakpoint
ALTER TABLE "contact_group_members" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "friend_request_groups" ADD CONSTRAINT "friend_request_groups_request_id_friend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."friend_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_request_groups" ADD CONSTRAINT "friend_request_groups_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_request_groups_group_idx" ON "friend_request_groups" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_owned_group_fk" FOREIGN KEY ("owner_id","group_id") REFERENCES "public"."contact_groups"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_contact_fk" FOREIGN KEY ("owner_id","user_id") REFERENCES "public"."contacts"("owner_id","contact_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_group_members_owner_user_idx" ON "contact_group_members" USING btree ("owner_id","user_id");
