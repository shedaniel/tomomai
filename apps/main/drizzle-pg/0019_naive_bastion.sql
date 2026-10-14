CREATE TABLE "friend_hides" (
	"userId" text NOT NULL,
	"hiddenUserId" text NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "friend_hides_userId_hiddenUserId_pk" PRIMARY KEY("userId","hiddenUserId")
);
--> statement-breakpoint
CREATE TABLE "player_friends" (
	"identityId" bigint NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	CONSTRAINT "player_friends_identityId_codeHash_pk" PRIMARY KEY("identityId","codeHash")
);
--> statement-breakpoint
CREATE TABLE "player_identities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" text NOT NULL,
	"game" "game" NOT NULL,
	"region" "region" NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"friendsSyncedAt" timestamp (0),
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "player_identities_userid_game_region_unique" UNIQUE("userId","game","region"),
	CONSTRAINT "player_identities_game_region_codehash_unique" UNIQUE("game","region","codeHash")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profileShareWithFriends" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "friendsEnabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "friend_hides" ADD CONSTRAINT "friend_hides_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_hides" ADD CONSTRAINT "friend_hides_hiddenUserId_user_id_fk" FOREIGN KEY ("hiddenUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_friends" ADD CONSTRAINT "player_friends_identityId_player_identities_id_fk" FOREIGN KEY ("identityId") REFERENCES "public"."player_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_identities" ADD CONSTRAINT "player_identities_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_hides_hiddenuserid_idx" ON "friend_hides" USING btree ("hiddenUserId");--> statement-breakpoint
CREATE INDEX "player_friends_codehash_idx" ON "player_friends" USING btree ("codeHash");