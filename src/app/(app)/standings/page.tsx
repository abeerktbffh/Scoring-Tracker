"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboard, getBoard, getGames } from "@/lib/api";
import type { OverallRow, GameBoardRow, Game } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import { useBoard } from "@/components/BoardContext";
import { sortPlayers } from "@/lib/leaderboardSort";
import type { LeaderboardSortKey } from "@/lib/leaderboardSort";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Chip } from "@/components/Chip";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LockedState } from "@/components/LockedState";
import { Flame } from "@/design/icons";
import styles from "./page.module.css";

const WINDOW_OPTIONS = [
  { k: "daily", label: "Daily" },
  { k: "weekly", label: "Weekly" },
  { k: "monthly", label: "Monthly" },
  { k: "all", label: "All" },
];

type OverallState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; rows: OverallRow[] };

type BoardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; locked: boolean; rows: GameBoardRow[] };

type GamesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; games: Game[] };

export default function Standings(): JSX.Element {
  const { boardId } = useBoard();
  const [name, setName] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<string>("weekly");
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("wins");
  const [overall, setOverall] = useState<OverallState>({ status: "loading" });
  const [gamesState, setGamesState] = useState<GamesState>({ status: "loading" });
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>({ status: "idle" });
  const isFirstBoardLoad = useRef(true);

  const loadOverall = useCallback(
    (win: string, displayName: string | null) => {
      setOverall({ status: "loading" });
      getLeaderboard(win, displayName ?? undefined, boardId ?? undefined).then((result) => {
        if (!result.ok) {
          setOverall({ status: "error", message: result.error });
          return;
        }
        setOverall({ status: "ready", locked: result.data.locked, rows: result.data.players });
      });
    },
    [boardId]
  );

  const loadGames = useCallback(() => {
    setGamesState({ status: "loading" });
    getGames(boardId ?? undefined).then((result) => {
      if (!result.ok) {
        setGamesState({ status: "error", message: result.error });
        return;
      }
      setGamesState({ status: "ready", games: result.data.games });
      if (result.data.games.length > 0) {
        setSelectedGameId((current) => current ?? result.data.games[0].id);
      }
    });
  }, [boardId]);

  const loadBoard = useCallback(
    (gameId: string, win: string, displayName: string | null) => {
      setBoard({ status: "loading" });
      getBoard(gameId, win, displayName ?? undefined, boardId ?? undefined).then((result) => {
        if (!result.ok) {
          setBoard({ status: "error", message: result.error });
          return;
        }
        setBoard({ status: "ready", locked: result.data.locked, rows: result.data.players });
      });
    },
    [boardId]
  );

  useEffect(() => {
    const displayName = loadName();
    setName(displayName);
    if (isFirstBoardLoad.current) {
      isFirstBoardLoad.current = false;
    } else {
      // The board changed: the games list is now scoped to the new group,
      // so drop the old selection and let loadGames pick the new first game.
      setSelectedGameId(null);
    }
    loadOverall(windowKey, displayName);
    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (selectedGameId) {
      loadBoard(selectedGameId, windowKey, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId, windowKey]);

  const handleWindowChange = useCallback(
    (k: string) => {
      setWindowKey(k);
      loadOverall(k, name);
    },
    [loadOverall, name]
  );

  const handleRetryOverall = useCallback(() => loadOverall(windowKey, name), [loadOverall, windowKey, name]);
  const handleRetryGames = useCallback(() => loadGames(), [loadGames]);
  const handleRetryBoard = useCallback(() => {
    if (selectedGameId) loadBoard(selectedGameId, windowKey, name);
  }, [loadBoard, selectedGameId, windowKey, name]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Standings</h1>

      <Segmented options={WINDOW_OPTIONS} value={windowKey} onChange={handleWindowChange} />

      <Card>
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
          <EmptyState title="No standings yet" body="Once results are logged, the overall table will show up here." />
        )}
        {overall.status === "ready" && !overall.locked && overall.rows.length > 0 && (
          <LeaderboardTable
            rows={sortPlayers(overall.rows, sortKey)}
            sortKey={sortKey}
            onSort={setSortKey}
            me={name ?? undefined}
          />
        )}
      </Card>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Per game</h2>

        {gamesState.status === "loading" && (
          <div className={styles.chipRow}>
            <Skeleton w={70} h={26} radius={99} />
            <Skeleton w={70} h={26} radius={99} />
            <Skeleton w={70} h={26} radius={99} />
          </div>
        )}
        {gamesState.status === "error" && <ErrorState message={gamesState.message} onRetry={handleRetryGames} />}
        {gamesState.status === "ready" && gamesState.games.length === 0 && (
          <EmptyState title="No games yet" body="Games will appear here once they're added." />
        )}
        {gamesState.status === "ready" && gamesState.games.length > 0 && (
          <>
            <div className={styles.chipRow}>
              {gamesState.games.map((game) => (
                <Chip
                  key={game.id}
                  active={game.id === selectedGameId}
                  onClick={() => setSelectedGameId(game.id)}
                >
                  {game.name}
                </Chip>
              ))}
            </div>

            <Card>
              {board.status === "idle" && (
                <EmptyState title="Pick a game" body="Select a game above to see its board." />
              )}
              {board.status === "loading" && (
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
                <EmptyState title="No results yet" body="Once this game has results, the board will show up here." />
              )}
              {board.status === "ready" && !board.locked && board.rows.length > 0 && (
                <GameBoardTable rows={board.rows} me={name ?? undefined} />
              )}
            </Card>
          </>
        )}
      </section>
    </div>
  );
}

interface GameBoardTableProps {
  rows: GameBoardRow[];
  me?: string;
}

function GameBoardTable({ rows, me }: GameBoardTableProps): JSX.Element {
  return (
    <table className={styles.boardTable}>
      <thead>
        <tr className={styles.boardHeaderRow}>
          <th className={styles.boardHeaderCell} />
          <th className={styles.boardHeaderCell}>Player</th>
          <th className={styles.boardHeaderCell}>Best</th>
          <th className={styles.boardHeaderCell}>Streak</th>
          <th className={styles.boardHeaderCell}>Wins</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isMe = row.displayName === me;
          return (
            <tr
              key={row.displayName}
              className={[styles.boardRow, isMe ? styles.me : ""].filter(Boolean).join(" ")}
            >
              <td className={styles.rankCell}>{index + 1}</td>
              <td className={styles.nameCell}>{row.displayName}</td>
              <td className={styles.statCell}>{row.bestValue}</td>
              <td className={styles.statCell}>
                <span className={styles.streakCell}>
                  <Flame size={13} />
                  {row.currentStreak}
                </span>
              </td>
              <td className={styles.statCell}>{row.wins}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
