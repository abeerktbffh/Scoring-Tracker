import React from "react";
import type { MedalBoardRow } from "@/lib/api";
import styles from "@/app/(app)/standings/page.module.css";

export interface MedalBoardTableProps {
  rows: MedalBoardRow[];
  me?: string;
}

export function MedalBoardTable({ rows, me }: MedalBoardTableProps): JSX.Element {
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={[styles.boardHeaderCell, styles.medalsCol].join(" ")}>Medals</th>
          <th className={[styles.boardHeaderCell, styles.playedCol].join(" ")}>Played</th>
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
            <td className={[styles.statCell, styles.medalsCol].join(" ")}>
              🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}
            </td>
            <td className={[styles.statCell, styles.playedCol].join(" ")}>{row.gamesPlayed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
