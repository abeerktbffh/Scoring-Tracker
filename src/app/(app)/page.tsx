"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getLeaderboard } from "@/lib/api";
import type { MeResponse, OverallRow } from "@/lib/api";
import { useBoard } from "@/components/BoardContext";
import { sortByMedals } from "@/lib/leaderboardSort";
import { Card } from "@/components/Card";
import { Tile } from "@/components/Tile";
import { StreakBadge } from "@/components/StreakBadge";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import styles from "./page.module.css";

const SNAPSHOT_SIZE = 5;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; me: MeResponse; rows: OverallRow[] };

function bestCurrentStreak(me: MeResponse): number {
  return me.streaks.reduce((max, s) => Math.max(max, s.currentStreak), 0);
}

export default function Home(): JSX.Element {
  const router = useRouter();
  const { boardId } = useBoard();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([
      // The `player` arg is a legacy param the server ignores — viewer identity
      // is resolved from the session, not this client-supplied value.
      getMe("", boardId ?? undefined),
      getLeaderboard("weekly", undefined, boardId ?? undefined),
    ]).then(([meResult, leaderboardResult]) => {
      if (!meResult.ok) {
        setState({ status: "error", message: meResult.error });
        return;
      }
      if (!leaderboardResult.ok) {
        setState({ status: "error", message: leaderboardResult.error });
        return;
      }
      setState({ status: "ready", me: meResult.data, rows: leaderboardResult.data.players });
    });
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = useCallback(() => load(), [load]);
  const goToLog = useCallback(() => router.push("/log"), [router]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Home</h1>

      {state.status === "loading" && (
        <div className={styles.skeletons}>
          <Card>
            <Skeleton w={80} h={11} />
            <Skeleton w={140} h={32} radius={6} />
            <div className={styles.skeletonTiles}>
              <Skeleton w={26} h={26} radius={4} />
              <Skeleton w={26} h={26} radius={4} />
              <Skeleton w={26} h={26} radius={4} />
              <Skeleton w={26} h={26} radius={4} />
              <Skeleton w={26} h={26} radius={4} />
            </div>
          </Card>
          <Skeleton w={100} h={12} />
          <Skeleton h={140} radius={16} />
        </div>
      )}

      {state.status === "error" && <ErrorState message={state.message} onRetry={handleRetry} />}

      {state.status === "ready" && (
        <HomeReady
          me={state.me}
          rows={state.rows}
          onLog={goToLog}
          isGroup={boardId !== null}
        />
      )}
    </div>
  );
}

interface HomeReadyProps {
  me: MeResponse;
  rows: OverallRow[];
  onLog: () => void;
  isGroup: boolean;
}

function HomeReady({ me, rows, onLog, isGroup }: HomeReadyProps): JSX.Element {
  // totalCount reflects how many games the board tracks (group-tracked-active
  // games for a group; the catalog for the global board) — not whether the
  // viewer has logged anything. Only an empty catalog/tracking list is a true
  // "empty" state; a member who simply hasn't logged today still sees the
  // Today card + board.
  if (me.today.totalCount === 0) {
    if (isGroup) {
      return (
        <EmptyState title="No games tracked" body="This group isn't tracking any games yet." />
      );
    }
    return (
      <EmptyState
        title="Nothing logged yet"
        body="Log today's puzzle to start your streak and show up on the board."
        action={{ label: "Log today's puzzle", onClick: onLog }}
      />
    );
  }

  const streak = bestCurrentStreak(me);
  // Viewer identity comes from the server session (me.displayName), never
  // localStorage — a brand-new user has no localStorage name but is still
  // identified as "me" as soon as the server knows their display name.
  const name = me.displayName;
  // Show the top N, and if the viewer is outside the top N, show their row below
  // a gap with their TRUE rank so they can always see where they stand.
  const sorted = sortByMedals(rows);
  const snapshot = sorted.slice(0, SNAPSHOT_SIZE);
  const viewerIdx = name ? sorted.findIndex((r) => r.displayName === name) : -1;
  const viewerRow =
    viewerIdx >= SNAPSHOT_SIZE
      ? { row: sorted[viewerIdx], rank: viewerIdx + 1 }
      : undefined;

  return (
    <>
      <Card className={styles.today}>
        <p className={styles.label}>Today</p>
        <p className={styles.big}>
          <b className={styles.bigCount}>{me.today.loggedCount}</b> of {me.today.totalCount} done
        </p>
        <div className={styles.tiles}>
          {me.today.games.map((game) => (
            <Tile key={game.gameId} state={game.logged ? "solved" : "empty"}>
              {game.logged ? "✓" : "·"}
            </Tile>
          ))}
        </div>
        <div className={styles.streakRow}>
          <StreakBadge count={streak} />
          {streak > 0 && <span className={styles.streakLabel}>day streak</span>}
        </div>
      </Card>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>This week</h2>
        <Card>
          <LeaderboardTable rows={snapshot} me={name ?? undefined} viewerRow={viewerRow} />
        </Card>
      </section>
    </>
  );
}
