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
          <th className={styles.boardHeaderCell}>Medals</th>
          <th className={styles.boardHeaderCell}>PB</th>
          <th className={styles.boardHeaderCell}>Played</th>
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
              🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}
            </td>
            <td className={styles.statCell}>{row.pbFormatted ?? "—"}</td>
            <td className={styles.statCell}>{row.gamesPlayed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
