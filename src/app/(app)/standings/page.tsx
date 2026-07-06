"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboard, getBoard, getGames } from "@/lib/api";
import type { OverallRow, MedalBoardRow, DailyContestRow, Game } from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import { sortByMedals } from "@/lib/leaderboardSort";
import { Card } from "@/components/Card";
import { GameWindowNav } from "@/components/GameWindowNav";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { MedalBoardTable } from "@/components/MedalBoardTable";
import { DailyContestTable } from "@/components/DailyContestTable";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LockedState } from "@/components/LockedState";
import styles from "./page.module.css";

type OverallState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; rows: OverallRow[] };

type BoardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; mode: "daily" | "aggregate"; rows: DailyContestRow[] | MedalBoardRow[] };

export default function Standings(): JSX.Element {
  const { boardId } = useBoard();
  // Viewer identity comes from the server session (leaderboard/board
  // `viewerName`), never localStorage — a brand-new user has no localStorage
  // name but is still identified as "me" as soon as the server knows it.
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState<string>("overall");
  const [windowKey, setWindowKey] = useState<string>("weekly");
  const [games, setGames] = useState<Game[]>([]);
  const [overall, setOverall] = useState<OverallState>({ status: "loading" });
  const [board, setBoard] = useState<BoardState>({ status: "idle" });
  const first = useRef(true);

  const loadGames = useCallback(() => {
    getGames(boardId ?? undefined).then((r) => {
      if (r.ok) setGames(r.data.games);
    });
  }, [boardId]);

  const loadOverall = useCallback(
    (win: string) => {
      setOverall({ status: "loading" });
      getLeaderboard(win, undefined, boardId ?? undefined).then((r) => {
        if (!r.ok) {
          setOverall({ status: "error", message: r.error });
          return;
        }
        setOverall({ status: "ready", locked: r.data.locked, rows: r.data.players });
        setViewerName(r.data.viewerName);
      });
    },
    [boardId]
  );

  const loadBoard = useCallback(
    (game: string, win: string) => {
      setBoard({ status: "loading" });
      getBoard(game, win, undefined, boardId ?? undefined).then((r) => {
        if (!r.ok) {
          setBoard({ status: "error", message: r.error });
          return;
        }
        setBoard({ status: "ready", locked: r.data.locked, mode: r.data.mode, rows: r.data.players });
        setViewerName(r.data.viewerName);
      });
    },
    [boardId]
  );

  useEffect(() => {
    if (!first.current) {
      // The board changed: the games list is now scoped to the new group, so
      // drop any per-game selection/board and fall back to Overall — a stale
      // per-game selection could point at a game the new board doesn't track.
      setGameKey("overall");
      setBoard({ status: "idle" });
    }
    first.current = false;
    loadGames();
    loadOverall(windowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (gameKey === "overall") {
      loadOverall(windowKey);
    } else {
      loadBoard(gameKey, windowKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, windowKey]);

  const handleRetryOverall = useCallback(() => loadOverall(windowKey), [loadOverall, windowKey]);
  const handleRetryBoard = useCallback(() => loadBoard(gameKey, windowKey), [loadBoard, gameKey, windowKey]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Board</h1>

      <GameWindowNav
        games={games}
        gameKey={gameKey}
        onGameChange={setGameKey}
        windowKey={windowKey}
        onWindowChange={setWindowKey}
      />

      <Card>
        {gameKey === "overall" ? (
          <>
            {overall.status === "loading" && (
              <div className={styles.skeletonRows}>
                <Skeleton h={20} />
                <Skeleton h={20} />
                <Skeleton h={20} />
              </div>
            )}
            {overall.status === "error" && <ErrorState message={overall.message} onRetry={handleRetryOverall} />}
            {overall.status === "ready" && overall.locked && (
              <LockedState>
                <p>Log today&apos;s puzzle to reveal today&apos;s standings.</p>
              </LockedState>
            )}
            {overall.status === "ready" && !overall.locked && overall.rows.length === 0 && (
              <EmptyState title="No standings yet" body="Once results are logged, the medal tally shows up here." />
            )}
            {overall.status === "ready" && !overall.locked && overall.rows.length > 0 && (
              <LeaderboardTable rows={sortByMedals(overall.rows)} me={viewerName ?? undefined} />
            )}
          </>
        ) : (
          <>
            {(board.status === "idle" || board.status === "loading") && (
              <div className={styles.skeletonRows}>
                <Skeleton h={20} />
                <Skeleton h={20} />
              </div>
            )}
            {board.status === "error" && <ErrorState message={board.message} onRetry={handleRetryBoard} />}
            {board.status === "ready" && board.locked && (
              <LockedState>
                <p>Log today&apos;s puzzle to reveal today&apos;s standings.</p>
              </LockedState>
            )}
            {board.status === "ready" && !board.locked && board.rows.length === 0 && (
              <EmptyState title="No results yet" body="Once this game has results, the board shows up here." />
            )}
            {board.status === "ready" && !board.locked && board.rows.length > 0 && board.mode === "daily" && (
              <DailyContestTable rows={board.rows as DailyContestRow[]} me={viewerName ?? undefined} />
            )}
            {board.status === "ready" && !board.locked && board.rows.length > 0 && board.mode === "aggregate" && (
              <MedalBoardTable rows={board.rows as MedalBoardRow[]} me={viewerName ?? undefined} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
