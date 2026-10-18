CREATE TYPE "public"."deal_source" AS ENUM('taxAuthority', 'broker', 'owner');--> statement-breakpoint
CREATE TYPE "public"."import_issue_severity" AS ENUM('error', 'warning', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."property_condition" AS ENUM('newFromContractor', 'renovated', 'good', 'maintained', 'needsRenovation');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'duplex', 'penthouse', 'gardenApartment', 'rooftopApartment', 'privateHouse');--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "city_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"alias" text NOT NULL,
	"match_key" text NOT NULL,
	CONSTRAINT "city_aliases_match_key_unique" UNIQUE("match_key")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"city_id" integer NOT NULL,
	"neighborhood_id" integer,
	"street" text NOT NULL,
	"property_type" "property_type" NOT NULL,
	"rooms" double precision NOT NULL,
	"size_sqm" integer,
	"floor" integer,
	"total_floors" integer NOT NULL,
	"year_built" integer,
	"condition" "property_condition",
	"has_elevator" boolean,
	"has_parking" boolean,
	"has_balcony" boolean,
	"has_safe_room" boolean,
	"deal_date" date,
	"price_nis" integer NOT NULL,
	"price_per_sqm" integer,
	"source_price_per_sqm" integer,
	"source" "deal_source" NOT NULL,
	"source_row" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_deal_id_unique" UNIQUE("deal_id")
);
--> statement-breakpoint
CREATE TABLE "import_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"severity" "import_issue_severity" NOT NULL,
	"row_number" integer NOT NULL,
	"deal_id" text,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"deals_upserted" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"duplicates_removed" integer DEFAULT 0 NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "city_aliases" ADD CONSTRAINT "city_aliases_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_run_id_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_city_idx" ON "deals" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "deals_city_rooms_idx" ON "deals" USING btree ("city_id","rooms");--> statement-breakpoint
CREATE INDEX "deals_price_idx" ON "deals" USING btree ("price_nis");--> statement-breakpoint
CREATE INDEX "import_issues_run_idx" ON "import_issues" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "neighborhoods_city_name_idx" ON "neighborhoods" USING btree ("city_id","name");