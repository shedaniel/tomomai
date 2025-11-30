-- Drop existing tables to recreate with new schema
DROP TABLE IF EXISTS "store_edit_votes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "store_edits" CASCADE;--> statement-breakpoint

-- Update stores table to change chosenEditId type
ALTER TABLE "stores" DROP COLUMN IF EXISTS "chosenEditId";--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "chosenEditId" bigint;--> statement-breakpoint

-- Create store_edits table with bigint id
CREATE TABLE IF NOT EXISTS "store_edits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "store_edits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"storeId" bigint NOT NULL,
	"userId" text NOT NULL,
	"name" varchar(32),
	"address" text,
	"openingHours" text,
	"toilet" boolean,
	"smoke" boolean,
	"access" text,
	"status" "store_status",
	"currency" text,
	"games" jsonb,
	"additionalInfo" jsonb,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_edit_votes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "store_edit_votes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"editId" bigint NOT NULL,
	"userId" text NOT NULL,
	"vote" smallint NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "store_edit_votes_userid_editid_unique" UNIQUE("userId","editId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_edits" ADD CONSTRAINT "store_edits_storeId_stores_id_fk" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_edits" ADD CONSTRAINT "store_edits_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_edit_votes" ADD CONSTRAINT "store_edit_votes_editId_store_edits_id_fk" FOREIGN KEY ("editId") REFERENCES "public"."store_edits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_edit_votes" ADD CONSTRAINT "store_edit_votes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_edits_storeid_idx" ON "store_edits" USING btree ("storeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_edits_userid_idx" ON "store_edits" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_edit_votes_editid_idx" ON "store_edit_votes" USING btree ("editId");
