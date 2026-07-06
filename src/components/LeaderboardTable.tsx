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

function MedalCell({ row }: { row: OverallRow }): JSX.Element {
  return (
    <span>
      🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}
    </span>
  );
}

function Row({ row, rank, me }: { row: OverallRow; rank: number; me?: string }): JSX.Element {
  const isMe = row.displayName === me;
  return (
    <tr className={[styles.row, isMe ? styles.me : ""].filter(Boolean).join(" ")}>
      <td className={styles.rankCell}>{rank}</td>
      <td className={styles.nameCell}>
        <span className={styles.nameWrap}>
          {row.displayName}
          {rank === 1 && <Crown size={14} className={styles.crown} />}
        </span>
        {row.gamesLed.length > 0 && <span className={styles.subLine}>Leads: {row.gamesLed.join(", ")}</span>}
      </td>
      <td className={styles.statCell}>
        <MedalCell row={row} />
      </td>
      <td className={styles.statCell}>{row.gamesPlayed}</td>
    </tr>
  );
}

export function LeaderboardTable({ rows, me, viewerRow }: LeaderboardTableProps): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.headerCell} />
          <th className={styles.headerCell}>Player</th>
          <th className={styles.headerCell}>Medals</th>
          <th className={styles.headerCell}>Played</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <Row key={row.displayName} row={row} rank={index + 1} me={me} />
        ))}
        {viewerRow && (
          <>
            <tr className={styles.gapRow} aria-hidden="true">
              <td className={styles.gapCell} colSpan={4}>
                ⋯
              </td>
            </tr>
            <Row row={viewerRow.row} rank={viewerRow.rank} me={me} />
          </>
        )}
      </tbody>
    </table>
  );
}
