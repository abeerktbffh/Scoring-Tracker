"use client";
import React, { useCallback, useEffect, useState } from "react";
import { getMe, getLeaderboard } from "@/lib/api";
import type { MeResponse, OverallRow } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import { toDayNumber } from "@/lib/day";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { StreakBadge } from "@/components/StreakBadge";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import styles from "./page.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; me: MeResponse; rows: OverallRow[] };

function bestLongestStreak(me: MeResponse): number {
  return me.streaks.reduce((max, s) => Math.max(max, s.longestStreak), 0);
}

function rankOf(rows: OverallRow[], name: string | null): number | null {
  if (!name) return null;
  const sorted = [...rows].sort((a, b) => b.wins - a.wins);
  const index = sorted.findIndex((r) => r.displayName === name);
  return index === -1 ? null : index + 1;
}

function relativeDay(dateStr: string, todayStr: string): string {
  const diff = toDayNumber(todayStr) - toDayNumber(dateStr);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return dateStr;
}

export default function You(): JSX.Element {
  const [name, setName] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });

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

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>You</h1>

      {state.status === "loading" && (
        <div className={styles.skeletons}>
          <div className={styles.headerSkeleton}>
            <Skeleton w={44} h={44} radius={99} />
            <div className={styles.headerSkeletonText}>
              <Skeleton w={100} h={17} />
              <Skeleton w={80} h={11} />
            </div>
          </div>
          <div className={styles.statRow}>
            <Skeleton h={64} radius={16} />
            <Skeleton h={64} radius={16} />
            <Skeleton h={64} radius={16} />
          </div>
          <Skeleton h={100} radius={16} />
        </div>
      )}

      {state.status === "error" && <ErrorState message={state.message} onRetry={handleRetry} />}

      {state.status === "ready" && <YouReady me={state.me} rows={state.rows} name={name} />}
    </div>
  );
}

interface YouReadyProps {
  me: MeResponse;
  rows: OverallRow[];
  name: string | null;
}

function YouReady({ me, rows, name }: YouReadyProps): JSX.Element {
  if (!name) {
    return (
      <EmptyState
        title="You're not signed in"
        body="Sign in or set a name to see your stats, streaks, and history."
      />
    );
  }

  const myRow = rows.find((r) => r.displayName === name);
  const rank = rankOf(rows, name);
  const wins = myRow?.wins ?? 0;
  const winRate = myRow?.winRate ?? 0;
  const bestStreak = bestLongestStreak(me);
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <>
      <div className={styles.header}>
        <div className={styles.avatar}>{initial}</div>
        <div>
          <p className={styles.name}>{name}</p>
          <p className={styles.rank}>{rank !== null ? `Rank #${rank} · this week` : "Unranked this week"}</p>
        </div>
      </div>

      <div className={styles.statRow}>
        <StatCard value={wins} label="Wins" />
        <StatCard value={bestStreak} label="Best streak" />
        <StatCard value={`${Math.round(winRate * 100)}%`} label="Win rate" />
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your streaks</h2>
        <Card>
          <ul className={styles.streakList}>
            {me.streaks.map((s) => (
              <li key={s.gameId} className={styles.streakRow}>
                <span>{s.name}</span>
                <StreakBadge count={s.currentStreak} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent</h2>
        {me.recent.length === 0 ? (
          <EmptyState title="No recent history" body="Log a puzzle to start building your history." />
        ) : (
          <Card>
            <ul className={styles.recentList}>
              {me.recent.map((r, index) => (
                <li key={`${r.gameId}-${r.puzzleDate}-${index}`} className={styles.recentRow}>
                  <span className={styles.recentGame}>
                    {r.name}
                    {r.variant ? ` ${r.variant}` : ""}
                  </span>
                  <span className={styles.recentValue}>{r.value}</span>
                  <span className={styles.recentDay}>{relativeDay(r.puzzleDate, me.today.date)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
