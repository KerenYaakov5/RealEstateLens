-- One permanent registration code replaces per-person invite codes (never in production).
DROP TABLE "invite_codes";
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "invite_code_id" TO "registration_code_id";
--> statement-breakpoint
-- The old ids pointed into the dropped table.
UPDATE "users" SET "registration_code_id" = NULL;
--> statement-breakpoint
CREATE TABLE "registration_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registration_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code_hash" text NOT NULL,
	"code_encrypted" text NOT NULL,
	"hint" text NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_codes_code_hash_unique" UNIQUE("code_hash")
);
