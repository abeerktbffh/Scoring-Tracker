import React from "react";
import type { DailyContestRow } from "@/lib/api";
import styles from "@/app/(app)/standings/page.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

export interface DailyContestTableProps {
  rows: DailyContestRow[];
  me?: string;
}

export function DailyContestTable({ rows, me }: DailyContestTableProps): JSX.Element {
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.displayName}
            className={[styles.boardRow, row.displayName === me ? styles.me : ""].filter(Boolean).join(" ")}
          >
            <td className={styles.rankCell}>{index + 1}</td>
            <td className={styles.nameCell}>{row.displayName}</td>
            <td className={styles.statCell}>
              {row.medal ? `${MEDAL_EMOJI[row.medal]} ` : ""}
              <span>{row.valueFormatted}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
