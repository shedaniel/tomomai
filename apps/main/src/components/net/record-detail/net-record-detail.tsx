"use client";

import { useTranslations } from "next-intl";
import type { MaimaiPlaylog } from "@/lib/games/maimai/recent-details";
import { cn } from "@/lib/utils";
import { NetTomomaiAi } from "../collection/collection-art";
import { NetButtonLink, NetNote, NetPanel } from "../kit";
import { NetStarArt } from "../net-art";
import { NetPaywall } from "../net-paywall";
import { formatLoss, JUDGEMENTS, LOSS_JUDGEMENTS, NOTE_KINDS, type NetRecordAnalysis, type NetVerdict } from "./analysis";
import styles from "./record-detail.module.css";

const DX_STAR_SLOTS = 5;

function DxStars({ dxScore, maxDxScore, stars }: { dxScore: number; maxDxScore: number; stars: number }) {
  const t = useTranslations("net.recordDetail");
  const filled = Math.min(stars, DX_STAR_SLOTS);
  return (
    <div className={styles.stars}>
      <b className={styles.starsLabel}>{t("dxStars")}</b>
      <span className={styles.starsRow} aria-label={String(stars)}>
        {Array.from({ length: DX_STAR_SLOTS }, (_, index) => (
          <NetStarArt key={index} size={20} filled={index < filled} className={index < filled ? undefined : styles.starEmpty} />
        ))}
      </span>
      {maxDxScore > 0 && <span className={styles.starsPct}>{t("dxPercent", { percent: (dxScore / maxDxScore * 100).toFixed(2) })}</span>}
    </div>
  );
}

function JudgementTable({ notes }: { notes: MaimaiPlaylog["notes"] }) {
  const t = useTranslations("net.recordDetail");
  const column = (judgement: (typeof JUDGEMENTS)[number]) => NOTE_KINDS.reduce((sum, note) => sum + notes[note][judgement], 0);
  const row = (note: (typeof NOTE_KINDS)[number]) => JUDGEMENTS.reduce((sum, judgement) => sum + notes[note][judgement], 0);
  const grand = NOTE_KINDS.reduce((sum, note) => sum + row(note), 0);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            {JUDGEMENTS.map(judgement => <th key={judgement} className={styles[judgement]}>{t(`judgements.${judgement}`)}</th>)}
            <th className={styles.totalHead}>{t("total")}</th>
          </tr>
        </thead>
        <tbody>
          {NOTE_KINDS.map(note => (
            <tr key={note}>
              <th scope="row">{t(`notes.${note}`)}</th>
              {JUDGEMENTS.map(judgement => (
                <td key={judgement} className={cn(styles[judgement], notes[note][judgement] === 0 && styles.zero)}>{notes[note][judgement]}</td>
              ))}
              <td className={styles.totalCell}>{row(note)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t("total")}</th>
            {JUDGEMENTS.map(judgement => <td key={judgement} className={styles[judgement]}>{column(judgement)}</td>)}
            <td className={styles.totalCell}>{grand}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Verdicts({ verdicts }: { verdicts: NetVerdict[] }) {
  const t = useTranslations("net.recordDetail");
  const text = ({ key, values }: NetVerdict) => {
    if (key === "worst" && values) {
      return t("ai.worst", { ...values, note: t(`notes.${values.note}`), judgement: t(`judgements.${values.judgement}`) });
    }
    return t(`ai.${key}`, values);
  };
  return (
    <NetPanel heading={t("ai.heading")} className={styles.ai}>
      <ul className={styles.aiList}>
        {verdicts.map(verdict => <li key={verdict.key}>{text(verdict)}</li>)}
      </ul>
    </NetPanel>
  );
}

function Speechless() {
  const t = useTranslations("net.recordDetail");
  return (
    <NetPanel heading={t("ai.heading")} className={cn(styles.ai, styles.speechless)}>
      <div className={styles.speechlessBody}>
        <svg viewBox="0 0 64 64" width={72} height={72} aria-hidden><NetTomomaiAi mood="bored" /></svg>
        <div>
          <p className={styles.speechlessTitle}>{t("ai.speechless")}</p>
          <p className={styles.speechlessSub}>{t("ai.speechlessSub")}</p>
        </div>
      </div>
    </NetPanel>
  );
}

function Losses({ analysis }: { analysis: NetRecordAnalysis }) {
  const t = useTranslations("net.recordDetail");
  return (
    <NetPanel heading={t("losses.heading")}>
      {analysis.totalLoss <= 0 ? <p className={styles.lossNone}>{t("losses.none")}</p> : (
        <div className={styles.tableWrap}>
          <table className={cn(styles.table, styles.lossTable)}>
            <thead>
              <tr>
                <th>{t("losses.note")}</th>
                {LOSS_JUDGEMENTS.map(judgement => <th key={judgement} className={styles[judgement]}>{t(`judgements.${judgement}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {NOTE_KINDS.map(note => (
                <tr key={note}>
                  <th scope="row">{t(`notes.${note}`)}</th>
                  {LOSS_JUDGEMENTS.map(judgement => {
                    const loss = analysis.losses[note][judgement];
                    return <td key={judgement} className={cn(!loss && styles.zero)}>{loss ? formatLoss(loss) : "-"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {analysis.totalLoss > 0 && <p className={styles.lossTotal}>{t("losses.total", { loss: formatLoss(analysis.totalLoss) })}</p>}
    </NetPanel>
  );
}

/** Everything under the score card on DX NET's playlog detail page, plus tomomai AI's opinion. */
export function NetRecordDetail({ playlog, analysis, dxScore, maxDxScore, stars, backHref, songHref }: {
  playlog: MaimaiPlaylog | null;
  analysis: NetRecordAnalysis | null;
  dxScore: number;
  maxDxScore: number;
  stars: number;
  backHref: string;
  songHref: string | null;
}) {
  const t = useTranslations("net.recordDetail");
  const change = playlog?.ratingChange ?? 0;
  return (
    <>
      <DxStars dxScore={dxScore} maxDxScore={maxDxScore} stars={stars} />
      {playlog ? (
        <section className={styles.details}>
          <div className={styles.detailsHead}>
            <h3 className={styles.detailsTag}>{t("details")}</h3>
            <div className={styles.timing}>
              <span className={styles.fast}>{t("fast")}</span><b>{playlog.fast}</b>
              <span className={styles.late}>{t("late")}</span><b>{playlog.late}</b>
            </div>
          </div>
          <JudgementTable notes={playlog.notes} />
          <div className={styles.bars}>
            <div className={styles.bar}>
              <span className={styles.barTag}>{t("maxCombo")}</span>
              <b>{playlog.combo}/{playlog.maxCombo}</b>
            </div>
            <div className={styles.bar}>
              <span className={cn(styles.barTag, styles.barTagSync)}>{t("maxSync")}</span>
              <b>{playlog.syncScore != null && playlog.maxSyncScore ? `${playlog.syncScore}/${playlog.maxSyncScore}` : "-"}</b>
            </div>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{t("rating")}</dt>
              <dd>
                {playlog.rating.toLocaleString()}
                <span className={cn(styles.change, change > 0 && styles.up, change < 0 && styles.down)}>
                  {change > 0 ? t("ratingUp", { change }) : change < 0 ? t("ratingDown", { change: -change }) : t("ratingSame")}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t("venue")}</dt>
              <dd>{playlog.venue ?? t("venueUnknown")}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <NetNote>{t("noPlaylog")}</NetNote>
      )}
      {analysis?.flawless ? <Speechless /> : <Verdicts verdicts={analysis?.verdicts ?? [{ key: "noPlaylog" }]} />}
      {analysis && (
        <NetPaywall feature={t("losses.feature")} requires="premium">
          <Losses analysis={analysis} />
        </NetPaywall>
      )}
      <div className={styles.actions}>
        {songHref && <NetButtonLink href={songHref}>{t("songPage")}</NetButtonLink>}
        <NetButtonLink href={backHref} tone="orange">{t("back")}</NetButtonLink>
      </div>
    </>
  );
}
