CREATE TYPE "public"."store_status" AS ENUM('closed', 'open', 'temporarily_closed');--> statement-breakpoint
CREATE TABLE "store_edit_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"editId" uuid NOT NULL,
	"userId" text NOT NULL,
	"vote" smallint NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "store_edit_votes_userid_editid_unique" UNIQUE("userId","editId")
);
--> statement-breakpoint
CREATE TABLE "store_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "stores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"country" text NOT NULL,
	"area" text,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"location" "point",
	"chosenEditId" uuid,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "stores_name_address_unique" UNIQUE("name","address")
);
--> statement-breakpoint
ALTER TABLE "store_edit_votes" ADD CONSTRAINT "store_edit_votes_editId_store_edits_id_fk" FOREIGN KEY ("editId") REFERENCES "public"."store_edits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_edit_votes" ADD CONSTRAINT "store_edit_votes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_edits" ADD CONSTRAINT "store_edits_storeId_stores_id_fk" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_edits" ADD CONSTRAINT "store_edits_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_edit_votes_editid_idx" ON "store_edit_votes" USING btree ("editId");--> statement-breakpoint
CREATE INDEX "store_edits_storeid_idx" ON "store_edits" USING btree ("storeId");--> statement-breakpoint
CREATE INDEX "store_edits_userid_idx" ON "store_edits" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "stores_country_area_idx" ON "stores" USING btree ("country","area");