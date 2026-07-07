"use client";
import React, { useState } from "react";
import type { DailyContestRow } from "@/lib/api";
import { StatPills } from "@/components/StatPills";
import { ResultGrid } from "@/components/ResultGrid";
import { shapeForGame } from "@/lib/formatResult";
import { ChevronDown } from "@/design/icons";
import styles from "@/app/(app)/standings/page.module.css";

const MEDAL_EMOJI: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const GRID_SHAPES = new Set(["wordle", "connections", "hints"]); // Wordle/Connections/Strands render a grid

function hasDetail(row: DailyContestRow): boolean {
  const d = row.detail;
  return !!d && Object.keys(d).length > 0;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Composite expand-state key: a player can appear in more than one variant
// group (e.g. logged both Pips easy and hard today), so expansion must be
// scoped per (variant, player) — never shared across groups.
function expandKey(row: DailyContestRow): string {
  return `${row.variant ?? ""}|${row.displayName}`;
}

export interface DailyContestTableProps {
  rows: DailyContestRow[];
  gameId: string;
  me?: string;
}

export function DailyContestTable({ rows, gameId, me }: DailyContestTableProps): JSX.Element {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const showGrid = GRID_SHAPES.has(shapeForGame(gameId)) && gameId !== "minute-cryptic"; // minute-cryptic is hints-shaped but gridless

  let lastVariant: string | null = null;
  let rankInGroup = 0;
  let seenFirstGroup = false;

  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Result</th>
          <th className={styles.boardHeaderCell} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const variant = row.variant ?? null;
          const isNewGroup = !seenFirstGroup || variant !== lastVariant;
          if (isNewGroup) {
            lastVariant = variant;
            rankInGroup = 0;
            seenFirstGroup = true;
          }
          rankInGroup += 1;
          const rank = rankInGroup;

          const key = expandKey(row);
          const expandable = hasDetail(row);
          const open = openKey === key;
          const grid = row.detail?.grid;
          const dim =
            gameId === "connections" && grid
              ? grid.map((line) => new Set(line).size > 1) // mixed rows = mistakes → dim
              : undefined;
          return (
            <React.Fragment key={key}>
              {isNewGroup && variant !== null && (
                <tr className={styles.variantHeaderRow}>
                  <td colSpan={4} className={styles.variantHeaderCell}>{capitalize(variant)}</td>
                </tr>
              )}
              <tr className={[styles.boardRow, row.displayName === me ? styles.me : ""].filter(Boolean).join(" ")}>
                <td className={styles.rankCell}>{rank}</td>
                <td className={styles.nameCell}>{row.displayName}</td>
                <td className={styles.statCell}>
                  {row.medal ? `${MEDAL_EMOJI[row.medal]} ` : ""}
                  <span>{row.valueFormatted}</span>
                </td>
                <td className={styles.statCell}>
                  {expandable && (
                    <button
                      type="button"
                      className={[styles.expandBtn, open ? styles.expandBtnOpen : ""].filter(Boolean).join(" ")}
                      aria-label={open ? "Hide details" : "Show details"}
                      onClick={() => setOpenKey(open ? null : key)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  )}
                </td>
              </tr>
              {expandable && open && (
                <tr>
                  <td colSpan={4} className={styles.detailCell}>
                    <StatPills gameId={gameId} row={row} />
                    {showGrid && grid && grid.length > 0 && <ResultGrid grid={grid} dim={dim} />}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
