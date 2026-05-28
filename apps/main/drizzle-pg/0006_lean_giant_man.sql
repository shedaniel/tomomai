ALTER TYPE "public"."language" ADD VALUE 'ko';--> statement-breakpoint
ALTER TYPE "public"."region" ADD VALUE 'cn';--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "timezone";--> statement-breakpoint
DROP TYPE "public"."timezone";