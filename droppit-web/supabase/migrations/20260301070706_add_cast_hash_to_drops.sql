-- Add cast_hash column to drops table to support resolving casts to drafts
ALTER TABLE "public"."drops" ADD COLUMN "cast_hash" text;
