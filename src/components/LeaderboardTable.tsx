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
  /**
   * How to render the "Leads" sub-line: a short count (Home snapshot) or the
   * full list of game names (Overall board). Callers set this explicitly.
   */
  leads: "count" | "names";
  /** id -> name map, needed for the "names" treatment. */
  gameNames?: Record<string, string>;
}

function MedalCell({ row }: { row: OverallRow }): JSX.Element {
  return (
    <span>
      🥇{row.gold} 🥈{row.silver} 🥉{row.bronze}
    </span>
  );
}

function LeadsLine({
  row,
  leads,
  gameNames,
}: {
  row: OverallRow;
  leads: "count" | "names";
  gameNames?: Record<string, string>;
}): JSX.Element | null {
  if (row.gamesLed.length === 0) return null;
  if (leads === "count") {
    const n = row.gamesLed.length;
    return (
      <span className={styles.subLine}>
        Leads {n} game{n === 1 ? "" : "s"}
      </span>
    );
  }
  const names = row.gamesLed.map((id) => gameNames?.[id] ?? id);
  return <span className={styles.subLine}>Leads · {names.join(", ")}</span>;
}

function Row({
  row,
  rank,
  me,
  leads,
  gameNames,
}: {
  row: OverallRow;
  rank: number;
  me?: string;
  leads: "count" | "names";
  gameNames?: Record<string, string>;
}): JSX.Element {
  const isMe = row.displayName === me;
  return (
    <tr className={[styles.row, isMe ? styles.me : ""].filter(Boolean).join(" ")}>
      <td className={styles.rankCell}>{rank}</td>
      <td className={styles.nameCell}>
        <span className={styles.nameWrap}>
          {row.displayName}
          {rank === 1 && <Crown size={14} className={styles.crown} />}
        </span>
        <LeadsLine row={row} leads={leads} gameNames={gameNames} />
      </td>
      <td className={styles.statCell}>
        <MedalCell row={row} />
      </td>
      <td className={styles.statCell}>{row.gamesPlayed}</td>
    </tr>
  );
}

export function LeaderboardTable({ rows, me, viewerRow, leads, gameNames }: LeaderboardTableProps): JSX.Element {
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
          <Row key={row.displayName} row={row} rank={index + 1} me={me} leads={leads} gameNames={gameNames} />
        ))}
        {viewerRow && (
          <>
            <tr className={styles.gapRow} aria-hidden="true">
              <td className={styles.gapCell} colSpan={4}>
                ⋯
              </td>
            </tr>
            <Row row={viewerRow.row} rank={viewerRow.rank} me={me} leads={leads} gameNames={gameNames} />
          </>
        )}
      </tbody>
    </table>
  );
}
