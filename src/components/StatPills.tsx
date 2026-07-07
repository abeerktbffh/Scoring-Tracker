import React from "react";
import type { DailyContestRow, ResultDetail } from "@/lib/api";
import { shapeForGame } from "@/lib/formatResult";
import { formatClock } from "@/lib/time";
import styles from "./StatPills.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

export interface StatPillsProps {
  gameId: string;
  row: DailyContestRow;
}

function pills(gameId: string, row: DailyContestRow): string[] {
  const d: ResultDetail = row.detail ?? {};
  const out: string[] = [];
  out.push(row.solved ? "Solved" : "Failed");
  if (row.medal) out.push(MEDAL_EMOJI[row.medal]);

  switch (shapeForGame(gameId)) {
    case "wordle":
      if (typeof d.guesses === "number") out.push(`${d.guesses}/6 guesses`);
      if (d.hardMode) out.push("Hard mode");
      break;
    case "pinpoint":
      if (typeof d.guesses === "number") out.push(`${d.guesses} guesses`);
      if (d.trail && d.trail.length) out.push(`Trail: ${d.trail.join("→")}%`);
      break;
    case "connections":
      out.push(d.mistakes === 0 ? "Perfect" : `${d.mistakes ?? 0} mistakes`);
      break;
    case "hints":
      out.push((d.hints ?? 0) === 0 ? "No hints" : `${d.hints} hints`);
      if (typeof d.underPar === "number") out.push(`${d.underPar} under par`);
      if (d.theme) out.push(`Theme: ${d.theme}`);
      break;
    case "timed":
      if (typeof d.seconds === "number") out.push(formatClock(d.seconds));
      if (typeof d.backtracks === "number") out.push(`${d.backtracks} backtracks`);
      if (typeof d.redraws === "number") out.push(`${d.redraws} redraws`);
      if (d.difficulty) out.push(d.difficulty);
      break;
  }
  return out;
}

export function StatPills({ gameId, row }: StatPillsProps): JSX.Element {
  return (
    <div className={styles.pills}>
      {pills(gameId, row).map((p, i) => (
        <span key={i} className={styles.pill}>{p}</span>
      ))}
    </div>
  );
}
