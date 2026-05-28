CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"userId" text NOT NULL,
	"refillInterval" integer,
	"refillAmount" integer,
	"lastRefillAt" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rateLimitEnabled" boolean,
	"rateLimitTimeWindow" integer,
	"rateLimitMax" integer,
	"requestCount" integer,
	"remaining" integer,
	"lastRequest" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "score_data" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "score_data_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"songId" bigint NOT NULL,
	"achievement" integer NOT NULL,
	"dxScore" smallint NOT NULL,
	"fc" "fc" NOT NULL,
	"fs" "fs" NOT NULL,
	CONSTRAINT "score_data_songid_achievement_dxscore_fc_fs_unique" UNIQUE("songId","achievement","dxScore","fc","fs")
);
--> statement-breakpoint
CREATE TABLE "snapshot_b50" (
	"snapshotId" integer NOT NULL,
	"rank" smallint NOT NULL,
	"scoreId" integer NOT NULL,
	CONSTRAINT "snapshot_b50_snapshotId_rank_pk" PRIMARY KEY("snapshotId","rank")
);
--> statement-breakpoint
CREATE TABLE "snapshot_scores" (
	"snapshotId" integer NOT NULL,
	"scoreId" integer NOT NULL,
	CONSTRAINT "snapshot_scores_snapshotId_scoreId_pk" PRIMARY KEY("snapshotId","scoreId")
);
--> statement-breakpoint
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
ALTER TABLE "user_events" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_scores" ALTER COLUMN "snapshotId" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_snapshots" ALTER COLUMN "id" SET MAXVALUE 2147483647;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_data" ADD CONSTRAINT "score_data_songId_songs_id_fk" FOREIGN KEY ("songId") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_b50" ADD CONSTRAINT "snapshot_b50_snapshotId_user_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."user_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_b50" ADD CONSTRAINT "snapshot_b50_scoreId_score_data_id_fk" FOREIGN KEY ("scoreId") REFERENCES "public"."score_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_snapshotId_user_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."user_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_scores" ADD CONSTRAINT "snapshot_scores_scoreId_score_data_id_fk" FOREIGN KEY ("scoreId") REFERENCES "public"."score_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_event_steps" ADD CONSTRAINT "tour_event_steps_eventId_tour_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."tour_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikey_userid_idx" ON "apikey" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "score_data_songid_idx" ON "score_data" USING btree ("songId");--> statement-breakpoint
CREATE INDEX "tour_event_steps_eventid_idx" ON "tour_event_steps" USING btree ("eventId");