import React from "react";
import type { OverallRow } from "@/lib/api";
import type { LeaderboardSortKey } from "@/lib/leaderboardSort";
import { Crown } from "@/design/icons";
import styles from "./LeaderboardTable.module.css";

export interface LeaderboardTableProps {
  rows: OverallRow[];
  sortKey: LeaderboardSortKey;
  onSort: (key: LeaderboardSortKey) => void;
  me?: string;
  /**
   * Optional "your rank" row rendered below a visual gap, for when the viewer
   * is outside the visible `rows` (e.g. top-5 shown, viewer is 10th). `rank` is
   * the viewer's TRUE position, not derived from list index.
   */
  viewerRow?: { row: OverallRow; rank: number };
}

const COLUMNS: { key: LeaderboardSortKey; label: string }[] = [
  { key: "wins", label: "Wins" },
  { key: "gamesPlayed", label: "Played" },
  { key: "winRate", label: "Win%" },
];

export function LeaderboardTable({ rows, sortKey, onSort, me, viewerRow }: LeaderboardTableProps): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.headerCell} />
          <th className={styles.headerCell}>Player</th>
          {COLUMNS.map((col) => (
            <th key={col.key} className={styles.headerCell}>
              <button
                type="button"
                className={styles.sortButton}
                onClick={() => onSort(col.key)}
                aria-current={sortKey === col.key ? "true" : undefined}
              >
                {col.label}
              </button>
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
              <td className={styles.statCell}>{row.wins}</td>
              <td className={styles.statCell}>{row.gamesPlayed}</td>
              <td className={styles.statCell}>{Math.round(row.winRate * 100)}%</td>
            </tr>
          );
        })}
        {viewerRow && (
          <>
            <tr className={styles.gapRow} aria-hidden="true">
              <td className={styles.gapCell} colSpan={5}>
                ⋯
              </td>
            </tr>
            <tr className={[styles.row, styles.me].join(" ")}>
              <td className={styles.rankCell}>{viewerRow.rank}</td>
              <td className={styles.nameCell}>
                <span className={styles.nameWrap}>{viewerRow.row.displayName}</span>
              </td>
              <td className={styles.statCell}>{viewerRow.row.wins}</td>
              <td className={styles.statCell}>{viewerRow.row.gamesPlayed}</td>
              <td className={styles.statCell}>{Math.round(viewerRow.row.winRate * 100)}%</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}
