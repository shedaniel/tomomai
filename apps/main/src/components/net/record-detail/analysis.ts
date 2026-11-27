import { playlogNoteCounts, type MaimaiPlaylog } from "@/lib/games/maimai/recent-details";
import { calculateNoteLosses, distributeBreaks } from "@/lib/games/maimai/score-details";

export const NOTE_KINDS = ["tap", "hold", "slide", "touch", "break"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const JUDGEMENTS = ["cPerfect", "perfect", "great", "good", "miss"] as const;
export type Judgement = (typeof JUDGEMENTS)[number];
export const LOSS_JUDGEMENTS = ["perfect", "great", "good", "miss"] as const;
export type LossJudgement = (typeof LOSS_JUDGEMENTS)[number];

/** Achievement lost per note kind and judgement, in percent. Only BREAK loses anything on a PERFECT. */
export type NetLossTable = Record<NoteKind, Partial<Record<LossJudgement, number>>>;

export type NetVerdict = { key: string; values?: Record<string, string | number> };

/** `flawless`: every note CRITICAL PERFECT, or AP+ at 101.0000%. */
export type NetRecordAnalysis = { losses: NetLossTable; totalLoss: number; verdicts: NetVerdict[]; flawless: boolean };

const MAX_SCORE = 1010000;
const NEAR_PERFECT_SCORE = 1005000;

export const formatLoss = (loss: number) => `-${loss.toFixed(4)}%`;

/** Server side, so the break solver and its logger stay out of the client bundle. */
export function analyzeRecord(playlog: MaimaiPlaylog, scoreValue: number): NetRecordAnalysis {
  const notes = playlogNoteCounts(playlog.notes);
  const losses = calculateNoteLosses(notes, distributeBreaks(notes, scoreValue / 10000, notes.break.perfect, notes.break.great)) as NetLossTable;

  let totalLoss = 0;
  let worst: { note: NoteKind; judgement: LossJudgement; loss: number } | null = null;
  for (const note of NOTE_KINDS) {
    for (const judgement of LOSS_JUDGEMENTS) {
      const loss = losses[note][judgement] ?? 0;
      totalLoss += loss;
      if (loss > 0 && (!worst || loss > worst.loss)) worst = { note, judgement, loss };
    }
  }

  const allCritical = NOTE_KINDS.every(note => LOSS_JUDGEMENTS.every(judgement => playlog.notes[note][judgement] === 0));
  const flawless = allCritical || scoreValue >= MAX_SCORE;
  if (flawless) return { losses, totalLoss, verdicts: [{ key: "speechless" }], flawless };

  const verdicts: NetVerdict[] = [];
  if (scoreValue >= NEAR_PERFECT_SCORE) verdicts.push({ key: "close", values: { gap: ((MAX_SCORE - scoreValue) / 10000).toFixed(4) } });
  if (!worst) verdicts.push({ key: "perfect" });
  else verdicts.push({ key: "worst", values: { note: worst.note, judgement: worst.judgement, loss: `${worst.loss.toFixed(4)}%` } });

  const missed = NOTE_KINDS.reduce((sum, note) => sum + playlog.notes[note].miss, 0);
  if (missed > 0) verdicts.push({ key: "missed", values: { count: missed } });

  const { fast, late } = playlog;
  const timing = late > 5 && late > fast * 1.5 ? "late" : fast > 5 && fast > late * 1.5 ? "early" : "balanced";
  verdicts.push({ key: timing, values: { fast, late } });

  return { losses, totalLoss, verdicts, flawless };
}
