CREATE TYPE "public"."todo_block_type" AS ENUM('text', 'image');--> statement-breakpoint
CREATE TABLE "todo_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"todo_id" uuid NOT NULL,
	"type" "todo_block_type" NOT NULL,
	"position" integer NOT NULL,
	"text" text,
	"image_id" uuid,
	CONSTRAINT "todo_blocks_todo_position_unique" UNIQUE("todo_id","position"),
	CONSTRAINT "todo_blocks_position_check" CHECK ("todo_blocks"."position" >= 0),
	CONSTRAINT "todo_blocks_payload_check" CHECK (("todo_blocks"."type" = 'text' and "todo_blocks"."text" is not null and "todo_blocks"."image_id" is null) or ("todo_blocks"."type" = 'image' and "todo_blocks"."text" is null and "todo_blocks"."image_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_text_not_empty_check";--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_images" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_blocks" ADD CONSTRAINT "todo_blocks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_images" ADD CONSTRAINT "todo_images_todo_id_id_unique" UNIQUE("todo_id","id");--> statement-breakpoint
ALTER TABLE "todo_blocks" ADD CONSTRAINT "todo_blocks_owned_image_fk" FOREIGN KEY ("todo_id","image_id") REFERENCES "public"."todo_images"("todo_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_blocks_todo_position_idx" ON "todo_blocks" USING btree ("todo_id","position");--> statement-breakpoint
CREATE INDEX "todos_owner_updated_idx" ON "todos" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "todos_owner_deleted_idx" ON "todos" USING btree ("owner_id","deleted_at");--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_revision_check" CHECK ("todos"."revision" > 0);--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_text_not_empty_check" CHECK ("todos"."text" is null or char_length(btrim("todos"."text")) > 0);
