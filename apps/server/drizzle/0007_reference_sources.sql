CREATE TABLE "reference_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"source_modified_at" text,
	"checked_at" timestamp with time zone NOT NULL,
	"loaded_at" timestamp with time zone NOT NULL
);
