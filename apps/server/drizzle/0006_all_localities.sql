ALTER TABLE "cities" ALTER COLUMN "name_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "municipal_status" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "population" integer;