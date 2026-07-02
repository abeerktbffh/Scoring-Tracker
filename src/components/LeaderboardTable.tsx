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
}

const COLUMNS: { key: LeaderboardSortKey; label: string }[] = [
  { key: "wins", label: "Wins" },
  { key: "gamesPlayed", label: "Played" },
  { key: "winRate", label: "Win%" },
];

export function LeaderboardTable({ rows, sortKey, onSort, me }: LeaderboardTableProps): JSX.Element {
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
      </tbody>
    </table>
  );
}
