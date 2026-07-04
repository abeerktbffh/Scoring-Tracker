import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireMember } from "@/lib/membership";
import { GROUP_ID } from "@/lib/group";
import { computeOverall } from "@/scoring/leaderboard";
import type { GameEntry } from "@/scoring/wins";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

/**
 * Group-level access is now gated by session membership (`requireMember`),
 * not the legacy `group_token` cookie. `requireMember` re-resolves
 * membership from the DB on every call: no session -> 401, session but not
 * a member of the group -> 403.
 */
export async function GET(req: Request) {
  const guard = await requireMember();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const groupId = GROUP_ID;

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";
  // Viewer is resolved from the session, not a client-supplied param — used
  // only for no-peek (restricts, never widens) and self-highlight.
  const viewerPlayerId = guard.viewer.player?.id ?? null;

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);
  const start = windowStart(window, today);

  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
           e.parsed_value, e.solved, g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId}
      AND e.superseded_by IS NULL AND e.is_late = false
      AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
      AND e.puzzle_date <= ${today}::date
  `) as {
    player_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  // No-peek: for the daily window, only reveal games the viewer has played today.
  let visibleRows = rows;
  let locked = false;
  // No-peek is a UX/fairness aid, not a security boundary. The viewer is now
  // resolved from the session (never a client param); with no session
  // player, treat the viewer as having played nothing (locked).
  if (window === "daily") {
    const playedGameIds = new Set(
      rows.filter((r) => r.player_id === viewerPlayerId).map((r) => r.game_id),
    );
    locked = playedGameIds.size === 0;
    visibleRows = rows.filter((r) => playedGameIds.has(r.game_id));
  }

  const names = new Map(visibleRows.map((r) => [r.player_id, r.display_name]));
  const gameEntries: GameEntry[] = visibleRows.map((r) => ({
    playerId: r.player_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = computeOverall(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    wins: s.wins,
    gamesPlayed: s.gamesPlayed,
    winRate: s.winRate,
  }));
  return NextResponse.json({ window, locked, players });
}
