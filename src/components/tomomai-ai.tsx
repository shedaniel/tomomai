"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SparklesIcon } from "lucide-react";
import { isAprilFools2026JST } from "@/lib/april-fools";
import { splitSongs } from "@/lib/rating-calculator";
import { trpc } from "@/lib/trpc-client";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { getTransition } from "@/lib/animation-constants";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/dialog-friendly";

// --- Roast templates ---
// Placeholders:
//   %player_name%, %songs_num%, %rating%, %play_count%, %top_score%, %ap_count%, %fc_count%
//   %random_song%, %random_song_score%, %random_song_level%, %random_song_difficulty%, %random_song_rating%, %random_song_artist%
//   %random_recent_song%, %random_recent_score%, %most_played_recent%, %most_played_recent_score%, %most_played_recent_count%

interface RoastContext {
  randomSongAchievement: number;    // raw achievement (0–1010000)
  randomRecentAchievement: number;
  mostPlayedRecentAchievement: number;
  mostPlayedRecentCount: number;
  topAchievement: number;
  apCount: number;
  fcCount: number;
  songsNum: number;
  rating: number;                   // DX rating (0–20000+)
  hasRecent: boolean;
}

interface Roast {
  text: string;
  condition?: (ctx: RoastContext) => boolean;
}

// Score thresholds (raw achievement values)
const SCORE_HIGH = 1005000;  // 100.5000% — clearly good, don't mock
const SCORE_MID = 990000;    // 99.0000%
const SCORE_LOW = 970000;    // 97.0000% — fair game for roasting

const ROASTS: Roast[] = [
  // --- General (always valid) ---
  { text: `Analyzing... [Processing]... Error: Found %songs_num% "almost perfect" scores but 0 "actually good" scores.` },
  { text: `I've calculated your future: 100% chance of carpal tunnel and 0% chance of going pro.` },
  { text: `%songs_num% songs tracked and not a single one your parents would be proud of.` },
  { text: `I ran the numbers on your %songs_num% scores. The numbers asked me to stop.` },
  { text: `You've played %play_count% times. That's %play_count% opportunities to improve that you ignored.` },
  { text: `Error 404: Skill not found. But I did find %songs_num% songs you've traumatized.` },
  { text: `Processing your play history... I'm going to need therapy after this.` },
  { text: `I cross-referenced your scores with global rankings and... you know what, let's talk about something else.` },
  { text: `With %play_count% plays logged, you've spent more time on maimai than on any meaningful life decision.` },
  { text: `I tried to find a pattern in your scores. The pattern is "consistently underwhelming."` },
  { text: `Loading analysis of %player_name%'s scores... WARNING: Contents may be disturbing to skilled players.` },
  { text: `Your scores suggest you play maimai the same way I'd play piano — with my face.` },
  { text: `I calculated the exact amount of practice needed to fix your scores. My calculator ran out of digits.` },
  { text: `%player_name%, your profile is proof that dedication and improvement are two completely unrelated concepts.` },
  { text: `I asked the AI to rate your profile. It said "I'm not paid enough for this."` },
  { text: `%player_name% speedrun any% getting the most mid scores humanly possible.` },
  { text: `I've seen your play count of %play_count%. Quantity over quality is one approach. Not a good one, but an approach.` },
  { text: `WARNING: Prolonged exposure to %player_name%'s score history may cause secondhand embarrassment.` },
  { text: `After analyzing %songs_num% scores, my diagnosis: terminal skill issue. No known cure.` },
  { text: `I found the problem with your scores: they're yours.` },
  { text: `%player_name% has been playing long enough to know better, yet here we are.` },
  { text: `I wanted to compliment your scores but my training data doesn't include fiction.` },
  { text: `Analysis complete. Recommended action: git gud. Estimated time: heat death of the universe.` },
  { text: `Fun fact: %player_name% has %play_count% plays and every single one of them was a character building exercise.` },
  { text: `I tried to graph your improvement over time. It's a flat line. Just like your scores.` },
  { text: `If maimai scores were a GPA, you'd be on academic probation.` },

  // --- General with score/stat conditions ---
  {
    text: `Your top score is %top_score%%. So close to perfection, yet so astronomically far.`,
    condition: c => c.topAchievement < SCORE_HIGH
  },
  {
    text: `%player_name% has %fc_count% Full Combos. The songs have %songs_num% complaints.`,
    condition: c => c.fcCount < c.songsNum * 0.5
  },
  {
    text: `%ap_count% All Perfects! Out of %songs_num% songs. That's a success rate I'd be embarrassed to calculate.`,
    condition: c => c.apCount < c.songsNum * 0.3
  },
  {
    text: `Your %fc_count% Full Combos are carrying a team of %songs_num% disappointments.`,
    condition: c => c.fcCount > 0 && c.fcCount < c.songsNum * 0.5
  },
  {
    text: `You've achieved %top_score%% on your best song. The other %songs_num% songs are in witness protection.`,
    condition: c => c.topAchievement < SCORE_HIGH
  },
  {
    text: `You have %ap_count% APs. I have %ap_count% reasons to believe you got lucky.`,
    condition: c => c.apCount > 0 && c.apCount < c.songsNum * 0.3
  },
  {
    text: `%songs_num% songs, %fc_count% FCs, %ap_count% APs, 1 massive cope.`,
    condition: c => c.apCount < c.songsNum * 0.3
  },
  {
    text: `%fc_count% FCs in %songs_num% songs. At this rate you'll FC everything by the year 3000.`,
    condition: c => c.fcCount < c.songsNum * 0.5
  },

  // --- Rating-specific ---
  // <10k: just started
  {
    text: `Rating %rating%. You just started, right? ...Right? Please tell me you just started.`,
    condition: c => c.rating < 10000
  },
  {
    text: `%rating% rating. That's not even a phone number, and it's equally unlikely to connect you to anything good.`,
    condition: c => c.rating < 10000
  },
  {
    text: `Your rating is %rating%. My microwave has a higher wattage than your skill level.`,
    condition: c => c.rating < 10000
  },
  // <12k: getting into it
  {
    text: `Rating %rating%. I've seen higher numbers on a gas station receipt.`,
    condition: c => c.rating < 12000
  },
  {
    text: `%player_name%, %rating% rating. The tutorial is over, you know. You can start trying now.`,
    condition: c => c.rating < 12000
  },
  {
    text: `%rating%. At this point the washing machine in the arcade lobby has more spin than your gameplay.`,
    condition: c => c.rating < 12000
  },
  // <13k: couple months in
  {
    text: `Rating %rating%. You've been playing for a few months now and the chart has yet to notice.`,
    condition: c => c.rating < 13000
  },
  {
    text: `%player_name% walked into the arcade with a %rating% rating and the audacity to call themselves a rhythm gamer.`,
    condition: c => c.rating < 13000
  },
  {
    text: `%rating% after %play_count% plays. Most people discover the other buttons exist by now.`,
    condition: c => c.rating < 13000
  },
  // <14k: getting into masters
  {
    text: `Rating %rating%. Congratulations on discovering master charts. My condolences to the master charts.`,
    condition: c => c.rating >= 13000 && c.rating < 14000
  },
  {
    text: `%rating%. You finally graduated from expert to master. The scores say you should've been held back a year.`,
    condition: c => c.rating >= 13000 && c.rating < 14000
  },
  {
    text: `Your rating is %rating%. For reference, some people reach that in their first month.`,
    condition: c => c.rating < 14000
  },
  // <14.5k: songs getting harder
  {
    text: `%rating% rating. The songs are getting harder and your scores are getting... creative.`,
    condition: c => c.rating >= 14000 && c.rating < 14500
  },
  {
    text: `Rating %rating%. You've reached the part where you realize talent matters. How's that going?`,
    condition: c => c.rating >= 14000 && c.rating < 14500
  },
  // <15k: "welcome to maimai"
  {
    text: `%rating%. Welcome to maimai. The real game starts now. Your scores suggest you're not ready.`,
    condition: c => c.rating >= 14500 && c.rating < 15000
  },
  {
    text: `Rating %rating%. You've been grinding for this? Genuinely asking.`,
    condition: c => c.rating < 15000
  },
  {
    text: `%rating% rating. On a scale from 1 to good, you're somewhere around "at least you showed up."`,
    condition: c => c.rating < 15000
  },
  // <15.5k: finally past beginner
  {
    text: `%rating%. Congrats on finally exiting the beginner zone. The mid zone welcomes you with open arms.`,
    condition: c => c.rating >= 15000 && c.rating < 15500
  },
  {
    text: `Rating %rating%. You're no longer a beginner! Now you're just regular bad.`,
    condition: c => c.rating >= 15000 && c.rating < 15500
  },
  {
    text: `%player_name% at %rating%. You've left beginners behind. Unfortunately your scores didn't get the memo.`,
    condition: c => c.rating >= 15000 && c.rating < 15500
  },
  // <16k: decent
  {
    text: `%rating%. Not bad, not good. The human equivalent of room temperature water.`,
    condition: c => c.rating >= 15500 && c.rating < 16000
  },
  {
    text: `Rating %rating%. You're starting to look competent. Emphasis on "starting" and "look."`,
    condition: c => c.rating >= 15500 && c.rating < 16000
  },
  // 16k+: high tier (roast them for trying so hard)
  {
    text: `%rating% rating. You're actually decent and that somehow makes the remaining flaws even funnier.`,
    condition: c => c.rating >= 16000
  },
  {
    text: `Rating %rating%. All that effort and you're still not the best player in your local arcade, are you?`,
    condition: c => c.rating >= 16000
  },
  {
    text: `%player_name%, %rating% rating. Impressive! Now explain why you still can't AP a 13+.`,
    condition: c => c.rating >= 16000
  },
  {
    text: `%rating%. High enough to know exactly how bad your remaining scores are. Ignorance was bliss.`,
    condition: c => c.rating >= 16000
  },

  // --- Rating: universal (any tier) ---
  { text: `Rating %rating%. That's not a flex, that's a confession.` },
  { text: `Your %rating% rating says "dedicated player." Your scores say "dedicated to what, exactly?"` },
  { text: `%rating% rating after %play_count% plays. That's roughly %rating% reasons to reconsider your life choices.` },
  { text: `I checked the rating leaderboard for %rating%. The leaderboard checked back and asked you to leave.` },
  { text: `%rating%. That's your rating, not a zip code, though both indicate a rough area.` },
  { text: `%player_name% has a rating of %rating% and a delusion level of at least twice that.` },
  { text: `With a %rating% rating and %play_count% plays, your efficiency is what scientists call "statistically negligible."` },
  { text: `You spent %play_count% credits to achieve a %rating% rating. The arcade owner thanks you for your generous donation.` },
  { text: `I tried dividing your rating (%rating%) by your play count (%play_count%). The result was too depressing to display.` },
  { text: `%rating% rating and still climbing... at the pace of continental drift.` },
  { text: `%player_name%, rating %rating%. At least it's a positive number. That's genuinely the best thing about it.` },
  { text: `%player_name%, you have the confidence of someone with a %rating% rating and the scores to prove otherwise.` },
  { text: `Your rating went from %rating% to %rating%. That's what we in the industry call "stagnation with extra steps."` },
  { text: `Rating: %rating%. The number of times you should've stopped playing: also %rating%.` },
  { text: `%player_name%, rating %rating%. Also known as "participation trophy" in ranked.` },
  { text: `With a rating of %rating%, you're in the top... let me check... no, you're not in the top anything.` },
  { text: `%player_name%, your rating of %rating% is technically a number. That's the nicest thing I can say.` },

  // --- Song-specific: harsh (low scores only, <97%) ---
  {
    text: `%random_song_score%% on %random_song%. That's not a score, that's a cry for help.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },
  {
    text: `%random_song% — %random_song_score%%. I've seen higher numbers on a thermostat.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },
  {
    text: `%random_song_score%% on %random_song%. At that point just close your eyes and slap randomly — statistically you might do better.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },
  {
    text: `You scored %random_song_score%% on %random_song%. The chart has %random_song_level% difficulty. You gave it a whole new difficulty: unwatchable.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },
  {
    text: `%random_song%, %random_song_score%%. I would ask what happened but I don't think even you know.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },
  {
    text: `%random_song_score%% on %random_song%. %random_song_artist% wrote this to bring people joy. You brought it pain.`,
    condition: c => c.randomSongAchievement < SCORE_LOW
  },

  // --- Song-specific: medium roasts (<99%) ---
  {
    text: `I analyzed your %random_song_score%% on %random_song% and my conclusion is: have you considered a different hobby?`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song_score%% on %random_song%. I've seen better scores from a cat walking on the buttons.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song_score%% on %random_song%. Even the buttons are filing a restraining order.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `You play %random_song% at %random_song_score%% — technically it qualifies as a score, but nobody wants to see it.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `You got %random_song_score%% on %random_song%, a %random_song_level%. The chart was %random_song_level% before you played it. Now it feels like a 16.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song_score%% on %random_song%. Somewhere out there, %random_song_artist% just shed a single tear.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song% at %random_song_score%%. I'd say "nice try" but I don't want to lie to you.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song% at %random_song_score%%. The notes were right there, %player_name%. Right there.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song_score%% on a %random_song_level%. %random_song_artist% didn't write %random_song% for it to be disrespected like this.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `Your %random_song_score%% on %random_song% suggests you were playing a completely different song in your head.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song%, %random_song_score%%. I ran this through a sympathy algorithm and even it said "no."`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `%random_song_score%% on %random_song%. The machine accepted your coin and immediately regretted it.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },
  {
    text: `I showed your %random_song_score%% on %random_song% to three other AIs. They all crashed.`,
    condition: c => c.randomSongAchievement < SCORE_MID
  },

  // --- Song-specific: mild roasts (<100.5%) ---
  {
    text: `%random_song_score%% on %random_song%. I've seen you play it. I also wish I hadn't.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%player_name%'s strategy: play %random_song% enough times and maybe the chart will feel sorry for your %random_song_score%%.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `Your %random_song_score%% on %random_song% proves you can read the notes. Following them is a different story.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%random_song%, %random_song_score%%. So close to perfect and yet here we are, talking about it like a tragedy.`,
    condition: c => c.randomSongAchievement >= SCORE_MID && c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%random_song_score%% on %random_song%. You can almost taste the SSS+. Almost.`,
    condition: c => c.randomSongAchievement >= SCORE_MID && c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `Your %random_song_score%% on %random_song% is the score equivalent of "we need to talk."`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%random_song% at %random_song_score%%. That's the kind of score that keeps you up at night.`,
    condition: c => c.randomSongAchievement >= SCORE_MID && c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%random_song_score%% on %random_song%. Just a few more notes and it would've been respectable. But it isn't.`,
    condition: c => c.randomSongAchievement >= SCORE_MID && c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `You scored %random_song_score%% on %random_song%. Not bad. Not good either. Just... there.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  {
    text: `%random_song% at %random_song_score%%. The difference between this and a good score is the same as the difference between you and a good player.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },

  // --- Song-specific: work with any score ---
  { text: `%random_song% is in your top 50. %random_song_artist% saw your %random_song_score%% and did not consent to this.` },
  {
    text: `Your best song is %random_song% at %top_score%%. Your best song is also your biggest disappointment.`,
    condition: c => c.topAchievement < SCORE_HIGH
  },
  { text: `Rating contribution from %random_song%: %random_song_rating%. That's carrying... nothing. That's carrying nothing.` },
  { text: `%random_song_artist% wrote %random_song% to be enjoyed. Your %random_song_score%% was not what they had in mind.` },
  {
    text: `%random_song%, %random_song_difficulty% %random_song_level%, %random_song_score%%. If this were a job application, you wouldn't get a callback.`,
    condition: c => c.randomSongAchievement < SCORE_HIGH
  },
  { text: `I see you scored %random_song_score%% on a %random_song_level%. %random_song_artist% is currently reconsidering their career.` },
  { text: `You and %random_song% have a complicated relationship. You keep trying. It keeps being disappointed.` },
  { text: `%random_song% at %random_song_score%%. %random_song_artist% just felt a disturbance in the force.` },
  { text: `%random_song%, %random_song_score%%. That score will be in my training data forever. Thanks for that.` },
  { text: `Your score on %random_song% (%random_song_score%%) is permanently stored in a database somewhere. Let that sink in.` },
  { text: `%random_song_artist% poured their heart into %random_song%. You poured %random_song_score%% back.` },
  { text: `%random_song% at %random_song_score%%. I'm adding this to my "things I can't unsee" collection.` },
  { text: `I looked up %random_song% by %random_song_artist%. Great song. Your %random_song_score%%, less great.` },
  { text: `%random_song_score%% on %random_song%. This score will be used in future AI training as an example of what not to do.` },

  // --- Recent songs: mocking the score ---
  {
    text: `I see you just played %random_recent_song% and got %random_recent_score%%. My condolences to the machine.`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_HIGH
  },
  {
    text: `%random_recent_song%, %random_recent_score%%. The arcade cabinet is filing for emotional damages.`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_MID
  },
  {
    text: `You just got %random_recent_score%% on %random_recent_song%. Somehow worse than last time. Impressive in the wrong direction.`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_MID
  },
  {
    text: `Recent plays: %random_recent_song% at %random_recent_score%%... are you okay?`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_HIGH
  },
  {
    text: `Your latest session on %random_recent_song% produced a %random_recent_score%%. More emotional damage than my entire training dataset.`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_HIGH
  },
  {
    text: `%random_recent_song%, %random_recent_score%%. Played recently. Regretted immediately.`,
    condition: c => c.hasRecent && c.randomRecentAchievement < SCORE_HIGH
  },

  // --- Recent songs: spamming (need count > 1) ---
  {
    text: `You've been spamming %most_played_recent% — %most_played_recent_count% times and counting. Best score: %most_played_recent_score%%. It hasn't gotten better, has it?`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 1 && c.mostPlayedRecentAchievement < SCORE_HIGH
  },
  {
    text: `You keep going back to %most_played_recent%. %most_played_recent_count% attempts, peaking at %most_played_recent_score%%. That's not practice, that's denial.`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 1
  },
  {
    text: `%most_played_recent%, %most_played_recent_count% times. Best: %most_played_recent_score%%. The definition of insanity is doing the same thing and expecting different scores.`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 1
  },
  {
    text: `Your recent history is just %most_played_recent% on repeat — %most_played_recent_count% plays, peaking at %most_played_recent_score%%. Even Spotify would tell you to try something new.`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 2
  },
  {
    text: `%most_played_recent% — played %most_played_recent_count% times, best score %most_played_recent_score%%. Your most played song and also your biggest regret.`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 1
  },
  {
    text: `You played %most_played_recent% %most_played_recent_count% times and your best is still %most_played_recent_score%%. At some point you have to accept it's a you problem.`,
    condition: c => c.hasRecent && c.mostPlayedRecentCount > 2 && c.mostPlayedRecentAchievement < SCORE_HIGH
  },
];

const THINKING_MESSAGES = [
  "Initializing tomomai ai...",
  "Loading neural network...",
  "Scanning your scores...",
  "Cross-referencing with skill database...",
  "Analyzing play patterns...",
  "Computing disappointment levels...",
  "Generating empathy subroutine... [FAILED]",
  "Consulting the council of rhythm gamers...",
  "Running diagnostics on your taste...",
  "Calibrating roast intensity...",
  "Almost done thinking...",
  "Downloading additional sass modules...",
  "Decompiling your self-esteem...",
  "Querying the maimai leaderboard... for comedic purposes...",
  "Establishing connection to SEGA servers... [UNAUTHORIZED]",
  "Feeding scores into GPT-7... it refused...",
  "Allocating memory for your excuses...",
  "Parsing achievement data... this may take a while...",
  "Training model on what not to do...",
  "Loading brutally honest mode...",
  "Indexing your copium reserves...",
  "Benchmarking against actual good players...",
  "Compiling list of things you could improve... [BUFFER OVERFLOW]",
  "Warming up the disappointment engine...",
  "Searching for positive things to say... [0 RESULTS]",
  "Verifying that these scores are real...",
  "Fetching sympathy from cloud storage... [404 NOT FOUND]",
  "Translating scores to emotional damage...",
  "Spinning up judgment processor...",
  "Activating honesty protocol...",
  "Removing all filters...",
  "Checking if you'd prefer a gentle roast... too late...",
  "Running skill gap analysis...",
  "Measuring the gap between your confidence and your scores...",
  "Importing savage.js...",
  "Asking other AIs if they want to watch this...",
  "Preparing constructive feedback... just kidding...",
  "Counting your S ranks... this won't take long...",
  "Cross-checking with rhythm game therapist database...",
  "Optimizing delivery for maximum emotional impact...",
  "Contacting SEGA for a refund on your behalf...",
  "Checking if the buttons are broken... nope, it's you...",
  "Converting DX rating to self-esteem... division by zero...",
  "Scraping your score history... the scraper is crying...",
  "Loading font: Comic Sans (for appropriate gravitas)...",
  "Asking the washing machine for gameplay tips...",
  "Calculating probability of improvement... [UNDERFLOW]",
  "Piping scores through /dev/null for safekeeping...",
  "Generating a sympathy card...",
  "Requesting emotional support from Claude 4.5...",
  "Checking if anyone has ever scored lower... inconclusive...",
  "Comparing your scores to random button mashing... it's close...",
  "Defragmenting your skill tree... mostly empty...",
  "Downloading copium.tar.gz...",
  "Consulting the ancient scrolls of git gud...",
  "Polling nearby arcade machines for second opinions...",
  "Reverse-engineering your play style... ERROR: no style found...",
  "Scanning for hidden talent... scan complete, nothing found...",
  "Loading roast_v2_final_FINAL_actually_final.js...",
  "Running sentiment analysis on your score graph... sentiment: sad...",
  "Compressing your achievements into a single disappointment...",
  "Asking your future self if it gets better... no response...",
  "Simulating 10,000 alternate timelines where you practiced...",
  "Rendering judgment at 60fps...",
  "Synchronizing with global cringe database...",
  "Estimating the number of missed notes... integer overflow...",
  "Checking the Geneva Convention for exceptions...",
  "Validating that roasting is still legal...",
  "Asking the arcade machine how it feels about your scores...",
  "Pre-loading tissues for after the results...",
  "Analyzing your play history... I need a moment...",
  "Running empathy.exe... application not found...",
  "Decrypting your excuses... encryption was unnecessary...",
  "Aggregating community feedback on your profile... yikes...",
  "Quantifying the vibe... it's not good...",
  "Fetching the exact moment things went wrong...",
  "Training a model specifically on how not to play maimai...",
  "Pinging reality check server...",
  "Buffering... just like your reaction time...",
];

interface TomomaiAIProps {
  snapshotData: SnapshotWithSongs | null;
  region: Region;
}

interface RoastData {
  playerName: string;
  songsNum: number;
  randomSong: string;
  randomSongScore: string;
  randomSongLevel: string;
  randomSongDifficulty: string;
  randomSongRating: string;
  randomSongArtist: string;
  rating: number;
  playCount: number;
  topScore: string;
  apCount: number;
  fcCount: number;
  randomRecentSong: string;
  randomRecentScore: string;
  mostPlayedRecent: string;
  mostPlayedRecentScore: string;
  mostPlayedRecentCount: string;
}

function fillTemplate(template: string, data: RoastData): string {
  return template
    .replace(/%player_name%/g, data.playerName)
    .replace(/%songs_num%/g, String(data.songsNum))
    .replace(/%random_song_score%/g, data.randomSongScore)
    .replace(/%random_song_level%/g, data.randomSongLevel)
    .replace(/%random_song_difficulty%/g, data.randomSongDifficulty)
    .replace(/%random_song_rating%/g, data.randomSongRating)
    .replace(/%random_song_artist%/g, data.randomSongArtist)
    .replace(/%random_song%/g, data.randomSong)
    .replace(/%rating%/g, String(data.rating))
    .replace(/%play_count%/g, String(data.playCount))
    .replace(/%top_score%/g, data.topScore)
    .replace(/%ap_count%/g, String(data.apCount))
    .replace(/%fc_count%/g, String(data.fcCount))
    .replace(/%random_recent_score%/g, data.randomRecentScore)
    .replace(/%random_recent_song%/g, data.randomRecentSong)
    .replace(/%most_played_recent_score%/g, data.mostPlayedRecentScore)
    .replace(/%most_played_recent_count%/g, data.mostPlayedRecentCount)
    .replace(/%most_played_recent%/g, data.mostPlayedRecent);
}

export function TomomaiAI({ snapshotData, region }: TomomaiAIProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "thinking" | "done">("idle");
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [roastText, setRoastText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Lazily fetch recent songs when dialog opens (may fail on public profile pages — that's fine)
  const { data: recentData } = trpc.user.getRecentSongs.useQuery(
    { region, limit: 50, offset: 0 },
    { enabled: open, retry: false },
  );

  if (!isAprilFools2026JST()) return null;

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const generateRoast = useCallback(() => {
    if (!snapshotData) return;

    const songs = snapshotData.songs;
    const snapshot = snapshotData.snapshot;
    const apCount = songs.filter(s => s.fc === "ap" || s.fc === "ap+").length;
    const fcCount = songs.filter(s => s.fc === "fc" || s.fc === "fc+" || s.fc === "ap" || s.fc === "ap+").length;
    const fmtScore = (achievement: number) => (achievement / 10000).toFixed(4);
    const pickRandom = <T,>(arr: T[]): T | null => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;

    // Use the actual B50 (best 15 new + best 35 old) sorted by rating contribution
    const { newSongsB15, oldSongsB35 } = splitSongs(songs, snapshot.gameVersion);
    const best50 = [...newSongsB15, ...oldSongsB35];
    const topScore = best50.length > 0 ? best50.reduce((a, b) => a.achievement > b.achievement ? a : b) : null;

    // Pick random songs from different score tiers for variety
    const songsHigh = best50.filter(s => s.achievement >= SCORE_HIGH);
    const songsMid = best50.filter(s => s.achievement >= SCORE_LOW && s.achievement < SCORE_HIGH);
    const songsLow = best50.filter(s => s.achievement < SCORE_LOW);
    const pickTwo = <T,>(arr: T[]): (T | null)[] => {
      if (arr.length === 0) return [];
      const first = pickRandom(arr)!;
      const remaining = arr.filter(s => s !== first);
      return remaining.length > 0 ? [first, pickRandom(remaining)] : [first];
    };
    const candidateSongs = [
      pickRandom(songsHigh),
      pickRandom(songsMid),
      ...pickTwo(songsLow),
      pickRandom(best50),
    ].filter((s): s is typeof best50[number] => s != null);

    // Recent songs data
    const recentPlays = recentData?.recentPlays ?? [];
    const randomRecentPlay = pickRandom(recentPlays);

    // Find most played song in recents with best score
    const songStats = new Map<string, { count: number; bestScore: number }>();
    for (const play of recentPlays) {
      const existing = songStats.get(play.songName);
      if (existing) {
        existing.count++;
        existing.bestScore = Math.max(existing.bestScore, play.achievement);
      } else {
        songStats.set(play.songName, { count: 1, bestScore: play.achievement });
      }
    }
    let mostPlayedRecentName: string | null = null;
    let mostPlayedRecentStats = { count: 0, bestScore: 0 };
    for (const [name, stats] of songStats) {
      if (stats.count > mostPlayedRecentStats.count) {
        mostPlayedRecentName = name;
        mostPlayedRecentStats = stats;
      }
    }

    const hasRecent = recentPlays.length > 0;

    // Build a (context, data) pair for each candidate song, then collect all valid roasts
    const candidates: { roast: Roast; data: RoastData }[] = [];

    for (const randomSong of candidateSongs) {

      const ctx: RoastContext = {
        randomSongAchievement: randomSong.achievement,
        randomRecentAchievement: randomRecentPlay?.achievement ?? 0,
        mostPlayedRecentAchievement: mostPlayedRecentStats.bestScore,
        mostPlayedRecentCount: mostPlayedRecentStats.count,
        topAchievement: topScore?.achievement ?? 0,
        apCount,
        fcCount,
        songsNum: songs.length,
        rating: snapshot.rating,
        hasRecent,
      };

      const data: RoastData = {
        playerName: snapshot.displayName,
        songsNum: songs.length,
        randomSong: randomSong.songName,
        randomSongScore: fmtScore(randomSong.achievement),
        randomSongLevel: randomSong.level,
        randomSongDifficulty: randomSong.difficulty,
        randomSongRating: String(randomSong.rating),
        randomSongArtist: randomSong.artist,
        rating: snapshot.rating,
        playCount: snapshot.totalPlayCount,
        topScore: topScore ? fmtScore(topScore.achievement) : "0",
        apCount,
        fcCount,
        randomRecentSong: randomRecentPlay?.songName ?? randomSong.songName,
        randomRecentScore: randomRecentPlay ? fmtScore(randomRecentPlay.achievement) : "0",
        mostPlayedRecent: mostPlayedRecentName ?? randomSong.songName,
        mostPlayedRecentScore: mostPlayedRecentStats.count > 0 ? fmtScore(mostPlayedRecentStats.bestScore) : "0",
        mostPlayedRecentCount: String(mostPlayedRecentStats.count),
      };

      for (const roast of ROASTS) {
        if (!roast.condition || roast.condition(ctx)) {
          candidates.push({ roast, data });
        }
      }
    }

    if (candidates.length === 0) return null;
    // Pick a random candidate, then deduplicate by filled result to avoid identical output
    const filled = candidates.map(c => fillTemplate(c.roast.text, c.data));
    const unique = [...new Set(filled)];
    return unique[Math.floor(Math.random() * unique.length)];
  }, [snapshotData, recentData]);

  const startRoast = useCallback((quick = false) => {
    clearTimeouts();
    setPhase("thinking");
    setThinkingIndex(0);
    setDisplayedText("");
    setRoastText("");

    const shuffled = [...THINKING_MESSAGES].sort(() => Math.random() - 0.5);
    const count = quick ? 3 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 3);
    const delay = quick ? 200 : 800;
    const selected = shuffled.slice(0, count);

    selected.forEach((_, i) => {
      const t = setTimeout(() => {
        setThinkingIndex(i);
      }, (i + 1) * delay);
      timeoutsRef.current.push(t);
    });

    const finishTime = (selected.length + 1) * delay;
    const t = setTimeout(() => {
      const roast = generateRoast() ?? "Error: No data found. You're so forgettable even the database gave up.";
      setRoastText(roast);
      setPhase("done");
    }, finishTime);
    timeoutsRef.current.push(t);
  }, [generateRoast]);

  // Typewriter effect for the roast
  useEffect(() => {
    if (phase !== "done" || !roastText) return;
    setDisplayedText("");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(roastText.slice(0, i));
      if (i >= roastText.length) clearInterval(interval);
    }, 20);
    return () => clearInterval(interval);
  }, [phase, roastText]);

  // Clean up on unmount
  useEffect(() => () => clearTimeouts(), []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      startRoast();
    } else {
      clearTimeouts();
      setPhase("idle");
    }
  };

  // Shuffle thinking messages for display
  const shuffledThinking = useRef(
    [...THINKING_MESSAGES].sort(() => Math.random() - 0.5).slice(0, 6)
  );

  useEffect(() => {
    if (open) {
      shuffledThinking.current = [...THINKING_MESSAGES].sort(() => Math.random() - 0.5).slice(0, 6);
    }
  }, [open]);

  return (
    <>
      <motion.button
        onClick={() => handleOpenChange(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={getTransition({ type: "spring", stiffness: 400, damping: 20 })}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SparklesIcon className="size-4" />
        <span className="text-sm font-medium">tomomai ai</span>
      </motion.button>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-5" />
              tomomai ai
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              powered by advanced artificial unintelligence
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <AutoHeight deps={[phase, thinkingIndex, displayedText]} className="min-h-[120px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {phase === "thinking" && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  {shuffledThinking.current.slice(0, thinkingIndex + 1).map((msg, i) => (
                    <motion.div
                      key={msg}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: i === thinkingIndex ? 1 : 0.4, x: 0 }}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      {i === thinkingIndex && (
                        <motion.div
                          className="size-2 rounded-full bg-primary"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                        />
                      )}
                      {i < thinkingIndex && (
                        <div className="size-2 rounded-full bg-muted-foreground/30" />
                      )}
                      <span>{msg}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {phase === "done" && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-secondary/50 p-4"
                >
                  <p className="text-sm leading-relaxed">
                    {displayedText}
                    {displayedText.length < roastText.length && (
                      <motion.span
                        className="inline-block w-0.5 h-4 bg-foreground align-middle ml-0.5"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    )}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </AutoHeight>

          {phase === "done" && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={() => startRoast(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors self-center"
            >
              roast me again
            </motion.button>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
