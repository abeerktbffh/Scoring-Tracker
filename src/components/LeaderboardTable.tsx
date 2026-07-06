import React from "react";
import type { OverallRow } from "@/lib/api";
import { Crown } from "@/design/icons";
import styles from "./LeaderboardTable.module.css";

export interface LeaderboardTableProps {
  rows: OverallRow[];
  me?: string;
  /**
   * Optional "your rank" row rendered below a visual gap, for when the viewer
   * is outside the visible `rows` (e.g. top-5 shown, viewer is 10th). `rank` is
   * the viewer's TRUE position, not derived from list index.
   */
  viewerRow?: { row: OverallRow; rank: number };
}

// TODO(Task 17): this is a compile-safe stopgap for the medal-tally
// `OverallRow` shape (gold/silver/bronze/gamesPlayed/gamesLed) — Task 17 owns
// the real Overall board UI (columns, gamesLed display, styling).
const COLUMNS: { key: "gold" | "silver" | "bronze" | "gamesPlayed"; label: string }[] = [
  { key: "gold", label: "Gold" },
  { key: "silver", label: "Silver" },
  { key: "bronze", label: "Bronze" },
  { key: "gamesPlayed", label: "Played" },
];

export function LeaderboardTable({ rows, me, viewerRow }: LeaderboardTableProps): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.headerCell} />
          <th className={styles.headerCell}>Player</th>
          {COLUMNS.map((col) => (
            <th key={col.key} className={styles.headerCell}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const rank = index + 1;
          const isMe = row.displayName === me;
          return (
            <tr
              key={row.displayName}
              className={[styles.row, isMe ? styles.me : ""].filter(Boolean).join(" ")}
            >
              <td className={styles.rankCell}>{rank}</td>
              <td className={styles.nameCell}>
                <span className={styles.nameWrap}>
                  {row.displayName}
                  {rank === 1 && <Crown size={14} className={styles.crown} />}
                </span>
              </td>
              <td className={styles.statCell}>{row.gold}</td>
              <td className={styles.statCell}>{row.silver}</td>
              <td className={styles.statCell}>{row.bronze}</td>
              <td className={styles.statCell}>{row.gamesPlayed}</td>
            </tr>
          );
        })}
        {viewerRow && (
          <>
            <tr className={styles.gapRow} aria-hidden="true">
              <td className={styles.gapCell} colSpan={6}>
                ⋯
              </td>
            </tr>
            <tr className={[styles.row, styles.me].join(" ")}>
              <td className={styles.rankCell}>{viewerRow.rank}</td>
              <td className={styles.nameCell}>
                <span className={styles.nameWrap}>{viewerRow.row.displayName}</span>
              </td>
              <td className={styles.statCell}>{viewerRow.row.gold}</td>
              <td className={styles.statCell}>{viewerRow.row.silver}</td>
              <td className={styles.statCell}>{viewerRow.row.bronze}</td>
              <td className={styles.statCell}>{viewerRow.row.gamesPlayed}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}
