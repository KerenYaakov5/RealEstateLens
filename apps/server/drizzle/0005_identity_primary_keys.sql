-- Hand-written: converts serial primary keys to GENERATED ALWAYS AS IDENTITY.
-- The generated version would fail on existing serial defaults/sequences and restart ids at 1.
-- For each table: drop the serial default and sequence, add the identity, then continue
-- numbering after the current maximum id so existing rows never collide.
ALTER TABLE "cities" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "cities_id_seq";--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"cities"', 'id'), COALESCE((SELECT MAX("id") FROM "cities"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "city_aliases" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "city_aliases_id_seq";--> statement-breakpoint
ALTER TABLE "city_aliases" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"city_aliases"', 'id'), COALESCE((SELECT MAX("id") FROM "city_aliases"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "deals_id_seq";--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"deals"', 'id'), COALESCE((SELECT MAX("id") FROM "deals"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "import_issues" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "import_issues_id_seq";--> statement-breakpoint
ALTER TABLE "import_issues" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"import_issues"', 'id'), COALESCE((SELECT MAX("id") FROM "import_issues"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "import_runs" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "import_runs_id_seq";--> statement-breakpoint
ALTER TABLE "import_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"import_runs"', 'id'), COALESCE((SELECT MAX("id") FROM "import_runs"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "neighborhoods" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "neighborhoods_id_seq";--> statement-breakpoint
ALTER TABLE "neighborhoods" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"neighborhoods"', 'id'), COALESCE((SELECT MAX("id") FROM "neighborhoods"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "users_id_seq";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false);
