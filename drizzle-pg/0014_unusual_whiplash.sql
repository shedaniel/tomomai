CREATE TABLE "tour_event_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tour_event_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"eventId" integer NOT NULL,
	"distance" integer NOT NULL,
	"type" text NOT NULL,
	"reward" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tour_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"periods" jsonb NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "tour_events_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "tour_event_steps" ADD CONSTRAINT "tour_event_steps_eventId_tour_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."tour_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tour_event_steps_eventid_idx" ON "tour_event_steps" USING btree ("eventId");