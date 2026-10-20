CREATE TABLE "app_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"request_id" text,
	"user_id" integer,
	"method" text,
	"path" text,
	"status" integer,
	"duration_ms" integer,
	"details" jsonb
);
--> statement-breakpoint
CREATE INDEX "app_logs_created_idx" ON "app_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_logs_category_created_idx" ON "app_logs" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "app_logs_user_idx" ON "app_logs" USING btree ("user_id");