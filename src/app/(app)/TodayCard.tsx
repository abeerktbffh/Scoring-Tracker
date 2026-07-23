import React, { useCallback, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Card } from "@/components/Card";
import { Tile } from "@/components/Tile";
import { StreakBadge } from "@/components/StreakBadge";
import { ChevronDown } from "@/design/icons";
import { formatPendingGames } from "@/lib/pendingGames";
import { gameUrl } from "@/lib/gameLinks";
import type { MeResponse } from "@/lib/api";
import styles from "./page.module.css";

export interface TodayCardProps {
  loggedCount: number;
  totalCount: number;
  games: MeResponse["today"]["games"];
  streak: number;
  todayDetail: MeResponse["todayDetail"];
}

/**
 * 1→"1st", 2→"2nd", 3→"3rd", else "Nth" (11/12/13 edge cases not special-cased —
 * out of scope for the small player counts this board deals with).
 */
function ordinal(n: number): string {
  switch (n) {
    case 1:
      return "1st";
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    default:
      return `${n}th`;
  }
}

function medalClass(rank: number | null): string | undefined {
  if (rank === 1) return styles.rank1;
  if (rank === 2) return styles.rank2;
  if (rank === 3) return styles.rank3;
  return undefined;
}

export function TodayCard({ loggedCount, totalCount, games, streak, todayDetail }: TodayCardProps): JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  // Clicking a play link inside the card must open the game, not toggle the
  // disclosure — bail out before the toggle fires whenever the click landed
  // inside an <a>.
  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("a")) return;
      toggle();
    },
    [toggle]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle]
  );

  return (
    <Card
      className={[styles.today, styles.todayCard].join(" ")}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.todayHeader}>
        <div>
          <p className={styles.label}>Today</p>
          <p className={styles.big}>
            <b className={styles.bigCount}>{loggedCount}</b> of {totalCount} done
          </p>
        </div>
        <ChevronDown size={18} className={[styles.chev, open ? styles.chevOpen : ""].join(" ")} />
      </div>
      <div className={styles.tiles}>
        {games.map((game) => (
          <Tile key={game.gameId} state={game.logged ? "solved" : "empty"}>
            {game.logged ? "✓" : "·"}
          </Tile>
        ))}
      </div>
      <p className={styles.pending}>{formatPendingGames(games)}</p>
      <div className={styles.streakRow}>
        <StreakBadge count={streak} />
        {streak > 0 && <span className={styles.streakLabel}>day streak</span>}
      </div>

      {open && (
        <div className={styles.expandPanel}>
          {todayDetail.map((g) => {
            const url = gameUrl(g.gameId);
            return (
              <div key={g.gameId} className={styles.gameRow}>
                <span className={styles.gameName}>{g.name}</span>
                <span className={styles.gameScore}>{g.valueFormatted ?? "Not played today"}</span>
                <span className={[styles.rankPill, medalClass(g.rank)].filter(Boolean).join(" ")}>
                  {g.rank != null ? `${ordinal(g.rank)} of ${g.playerCount}` : "—"}
                </span>
                {url && (
                  <a
                    className={styles.playLink}
                    href={url}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Open ${g.name}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                    </svg>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
