CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"date_key" text NOT NULL,
	"player_id" uuid,
	"guest_id" text,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'playing' NOT NULL,
	"hints_used" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tomomai_user_id" text NOT NULL,
	"username" text,
	"image" text,
	"show_on_leaderboard" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_tomomai_user_id_unique" UNIQUE("tomomai_user_id")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_player_day_idx" ON "attempts" USING btree ("mode","date_key","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_guest_day_idx" ON "attempts" USING btree ("mode","date_key","guest_id");--> statement-breakpoint
CREATE INDEX "attempts_board_idx" ON "attempts" USING btree ("mode","date_key","status","hints_used","finished_at");--> statement-breakpoint
CREATE INDEX "player_sessions_player_idx" ON "player_sessions" USING btree ("player_id");