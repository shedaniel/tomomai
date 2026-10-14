CREATE TABLE "daily_puzzles" (
	"mode" text NOT NULL,
	"date_key" text NOT NULL,
	"chart" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_puzzles_mode_date_key_pk" PRIMARY KEY("mode","date_key")
);
