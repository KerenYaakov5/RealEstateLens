CREATE TABLE "price_index" (
	"series_code" integer NOT NULL,
	"period" date NOT NULL,
	"value" double precision NOT NULL,
	"base_desc" text NOT NULL,
	"is_provisional" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_index_series_code_period_pk" PRIMARY KEY("series_code","period")
);
