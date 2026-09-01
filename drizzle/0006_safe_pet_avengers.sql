ALTER TABLE "removed_contacts" ALTER COLUMN "reason" DROP NOT NULL;--> statement-breakpoint
DELETE FROM "removed_contacts" older
USING "removed_contacts" newer
WHERE older."owner_id" = newer."owner_id"
	AND older."user_id" = newer."user_id"
	AND (older."removed_at", older."id") < (newer."removed_at", newer."id");--> statement-breakpoint
ALTER TABLE "removed_contacts" ADD CONSTRAINT "removed_contacts_owner_user_unique" UNIQUE("owner_id","user_id");
