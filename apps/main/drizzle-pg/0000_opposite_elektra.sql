CREATE TYPE "public"."chart_type" AS ENUM('std', 'dx');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('basic', 'advanced', 'expert', 'master', 'remaster', 'utage');--> statement-breakpoint
CREATE TYPE "public"."event_state" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('area', 'eventArea');--> statement-breakpoint
CREATE TYPE "public"."fc" AS ENUM('none', 'fc', 'fc+', 'ap', 'ap+');--> statement-breakpoint
CREATE TYPE "public"."fetch_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fs" AS ENUM('none', 'sync', 'fs', 'fs+', 'fdx', 'fdx+');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'en-GB', 'ja', 'zh-TW', 'zh-HK', 'zh-CN');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('1', '1+', '2', '2+', '3', '3+', '4', '4+', '5', '5+', '6', '6+', '7', '7+', '8', '8+', '9', '9+', '10', '10+', '11', '11+', '12', '12+', '13', '13+', '14', '14+', '15', '15+', '16', '16+');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('intl', 'jp');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."timezone" AS ENUM('Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Manila', 'Asia/Ho_Chi_Minh', 'Asia/Yangon', 'Australia/Adelaide', 'Australia/Eucla', 'Australia/Perth', 'Australia/Sydney', 'Australia/Lord_Howe', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'UTC');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp (0) NOT NULL,
	"updatedAt" timestamp (0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(21) NOT NULL,
	"userId" text NOT NULL,
	"region" "region" NOT NULL,
	"status" "fetch_status" NOT NULL,
	"startedAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"errorMessage" text,
	"statusStates" text,
	"extraData" jsonb,
	CONSTRAINT "fetch_sessions_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"createdBy" text NOT NULL,
	"claimedBy" text,
	"createdAt" timestamp (0) NOT NULL,
	"claimedAt" timestamp,
	"expiresAt" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp (0) NOT NULL,
	"updatedAt" timestamp (0) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "songs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(21) NOT NULL,
	"songName" text NOT NULL,
	"artist" text NOT NULL,
	"cover" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"level" "level" NOT NULL,
	"levelPrecise" smallint NOT NULL,
	"type" chart_type NOT NULL,
	"genre" text NOT NULL,
	"region" "region" NOT NULL,
	"gameVersion" smallint NOT NULL,
	"addedVersion" smallint NOT NULL,
	CONSTRAINT "songs_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "song_name_difficulty_type_region_version_unique" UNIQUE("songName","difficulty","type","region","gameVersion")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp (0) NOT NULL,
	"updatedAt" timestamp (0) NOT NULL,
	"username" varchar(32),
	"timezone" timezone,
	"language" "language",
	"role" "role" DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"banReason" text,
	"banExpires" timestamp (0),
	"region" "region",
	"publishProfile" boolean DEFAULT false NOT NULL,
	"profileMainRegion" "region" DEFAULT 'intl' NOT NULL,
	"profileShowAllScores" boolean DEFAULT true NOT NULL,
	"profileShowScoreDetails" boolean DEFAULT true NOT NULL,
	"profileShowPlates" boolean DEFAULT true NOT NULL,
	"profileShowPlayCounts" boolean DEFAULT true NOT NULL,
	"profileShowEvents" boolean DEFAULT true NOT NULL,
	"profileShowInSearch" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "username_pattern" CHECK ("user"."username" IS NULL OR (length("user"."username") >= 1 AND "user"."username" ~ '^[a-zA-Z0-9_-]+$'))
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshotId" bigint NOT NULL,
	"eventType" "event_type" NOT NULL,
	"name" text NOT NULL,
	"currentDistance" integer NOT NULL,
	"nextRewardDistance" integer,
	"state" "event_state" NOT NULL,
	"imageUrl" text NOT NULL,
	"eventPeriodStart" timestamp,
	"eventPeriodEnd" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_scores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_scores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshotId" bigint NOT NULL,
	"songId" bigint NOT NULL,
	"achievement" integer NOT NULL,
	"dxScore" smallint NOT NULL,
	"fc" "fc" NOT NULL,
	"fs" "fs" NOT NULL,
	"rank" smallint
);
--> statement-breakpoint
CREATE TABLE "user_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(21) NOT NULL,
	"userId" text NOT NULL,
	"region" "region" NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	"gameVersion" smallint NOT NULL,
	"rating" smallint NOT NULL,
	"courseRankUrl" text NOT NULL,
	"classRankUrl" text NOT NULL,
	"stars" smallint NOT NULL,
	"versionPlayCount" integer NOT NULL,
	"totalPlayCount" integer NOT NULL,
	"iconUrl" text NOT NULL,
	"displayName" varchar(16) NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "user_snapshots_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
CREATE TABLE "user_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"region" "region" NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp (0) NOT NULL,
	"updatedAt" timestamp (0) NOT NULL,
	CONSTRAINT "user_tokens_userId_region_unique" UNIQUE("userId","region")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp (0),
	"updatedAt" timestamp (0)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_sessions" ADD CONSTRAINT "fetch_sessions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_claimedBy_user_id_fk" FOREIGN KEY ("claimedBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_snapshotId_user_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."user_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scores" ADD CONSTRAINT "user_scores_snapshotId_user_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."user_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scores" ADD CONSTRAINT "user_scores_songId_songs_id_fk" FOREIGN KEY ("songId") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fetch_sessions_publicid_idx" ON "fetch_sessions" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "fetch_sessions_userid_region_startedat_idx" ON "fetch_sessions" USING btree ("userId","region","startedAt");--> statement-breakpoint
CREATE INDEX "songs_publicid_idx" ON "songs" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "songs_region_gameversion_idx" ON "songs" USING btree ("region","gameVersion");--> statement-breakpoint
CREATE INDEX "songs_songname_difficulty_idx" ON "songs" USING btree ("songName","difficulty");--> statement-breakpoint
CREATE INDEX "user_events_snapshotid_idx" ON "user_events" USING btree ("snapshotId");--> statement-breakpoint
CREATE INDEX "user_scores_snapshotid_rank_idx" ON "user_scores" USING btree ("snapshotId","rank");--> statement-breakpoint
CREATE INDEX "user_scores_snapshotid_songid_idx" ON "user_scores" USING btree ("snapshotId","songId");--> statement-breakpoint
CREATE INDEX "user_scores_songid_idx" ON "user_scores" USING btree ("songId");--> statement-breakpoint
CREATE INDEX "user_snapshots_publicid_idx" ON "user_snapshots" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "user_snapshots_userid_region_idx" ON "user_snapshots" USING btree ("userId","region");--> statement-breakpoint
CREATE INDEX "user_snapshots_userid_region_fetchedat_idx" ON "user_snapshots" USING btree ("userId","region","fetchedAt");