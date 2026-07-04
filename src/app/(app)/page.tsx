"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getLeaderboard } from "@/lib/api";
import type { MeResponse, OverallRow } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import { sortPlayers } from "@/lib/leaderboardSort";
import type { LeaderboardSortKey } from "@/lib/leaderboardSort";
import { Card } from "@/components/Card";
import { Tile } from "@/components/Tile";
import { StreakBadge } from "@/components/StreakBadge";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import styles from "./page.module.css";

const SNAPSHOT_SIZE = 4;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; me: MeResponse; rows: OverallRow[] };

function bestCurrentStreak(me: MeResponse): number {
  return me.streaks.reduce((max, s) => Math.max(max, s.currentStreak), 0);
}

export default function Home(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("wins");

  const load = useCallback((displayName: string | null) => {
    setState({ status: "loading" });
    Promise.all([getMe(displayName ?? ""), getLeaderboard("weekly", displayName ?? undefined)]).then(
      ([meResult, leaderboardResult]) => {
        if (!meResult.ok) {
          setState({ status: "error", message: meResult.error });
          return;
        }
        if (!leaderboardResult.ok) {
          setState({ status: "error", message: leaderboardResult.error });
          return;
        }
        setState({ status: "ready", me: meResult.data, rows: leaderboardResult.data.players });
      }
    );
  }, []);

  useEffect(() => {
    const displayName = loadName();
    setName(displayName);
    load(displayName);
  }, [load]);

  const handleRetry = useCallback(() => load(name), [load, name]);
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
        <HomeReady me={state.me} rows={state.rows} name={name} sortKey={sortKey} onSort={setSortKey} onLog={goToLog} />
      )}
    </div>
  );
}

interface HomeReadyProps {
  me: MeResponse;
  rows: OverallRow[];
  name: string | null;
  sortKey: LeaderboardSortKey;
  onSort: (key: LeaderboardSortKey) => void;
  onLog: () => void;
}

function HomeReady({ me, rows, name, sortKey, onSort, onLog }: HomeReadyProps): JSX.Element {
  const isEmpty = !name || (me.today.totalCount === 0 && rows.length === 0);

  if (isEmpty) {
    return (
      <EmptyState
        title="Nothing logged yet"
        body="Log today's puzzle to start your streak and show up on the board."
        action={{ label: "Log today's puzzle", onClick: onLog }}
      />
    );
  }

  const streak = bestCurrentStreak(me);
  // Show the top players, but ALWAYS include the viewer's own row so you can see
  // where you stand even if you're outside the top N (e.g. 5th of 5).
  const sorted = sortPlayers(rows, sortKey);
  const snapshot = sorted.slice(0, SNAPSHOT_SIZE);
  if (name && !snapshot.some((r) => r.displayName === name)) {
    const mine = sorted.find((r) => r.displayName === name);
    if (mine) snapshot.push(mine);
  }

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
          <LeaderboardTable rows={snapshot} sortKey={sortKey} onSort={onSort} me={name ?? undefined} />
        </Card>
      </section>
    </>
  );
}
