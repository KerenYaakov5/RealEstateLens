ALTER TABLE "cities" ADD COLUMN "cbs_code" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "itm_x" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "itm_y" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "coordinates_source" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "coordinates_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_cbs_code_unique" UNIQUE("cbs_code");