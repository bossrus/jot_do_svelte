ALTER TABLE "messages" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "message_images" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_payload_by_type_check";
ALTER TABLE "messages" ADD CONSTRAINT "messages_revision_check" CHECK ("messages"."revision" > 0);
ALTER TABLE "messages" ADD CONSTRAINT "messages_payload_by_type_check" CHECK (("messages"."type" = 'user' and "messages"."event_type" is null and "messages"."event_data" is null) or ("messages"."type" = 'system' and "messages"."event_type" is not null and char_length(btrim("messages"."event_type")) > 0));
ALTER TABLE "message_images" ADD CONSTRAINT "message_images_message_id_id_unique" UNIQUE("message_id","id");
CREATE TABLE "message_blocks" (
  "id" uuid PRIMARY KEY NOT NULL, "message_id" uuid NOT NULL, "type" "todo_block_type" NOT NULL,
  "position" integer NOT NULL, "text" text, "image_id" uuid,
  CONSTRAINT "message_blocks_message_position_unique" UNIQUE("message_id","position"),
  CONSTRAINT "message_blocks_position_check" CHECK ("position" >= 0),
  CONSTRAINT "message_blocks_payload_check" CHECK (("type" = 'text' and "text" is not null and "image_id" is null) or ("type" = 'image' and "text" is null and "image_id" is not null))
);
ALTER TABLE "message_blocks" ADD CONSTRAINT "message_blocks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;
ALTER TABLE "message_blocks" ADD CONSTRAINT "message_blocks_owned_image_fk" FOREIGN KEY ("message_id","image_id") REFERENCES "message_images"("message_id","id") ON DELETE CASCADE;
CREATE INDEX "message_blocks_message_position_idx" ON "message_blocks" ("message_id","position");
