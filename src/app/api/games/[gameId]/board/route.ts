import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";
import { PLATFORM_TZ } from "@/lib/group";
import { computeGameBoard, type DatedGameEntry } from "@/scoring/gameBoard";
import { isDailyBoardLocked } from "@/scoring/noPeek";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

/**
 * The board is global: access is gated by session identity (`requireUser`),
 * not group membership. `requireUser` re-resolves identity from the DB on
 * every call: no session -> 401.
 */
export async function GET(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const gameId = params.gameId;

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";
  // Viewer is resolved from the session, not a client-supplied param — used
  // only for no-peek (restricts, never widens).
  const viewerUserId = guard.viewer.userId;
  const today = localDateInTz(PLATFORM_TZ);
  const start = windowStart(window, today);

  // Fetch ALL of the game's on-time active entries (streaks are all-time).
  const rows = (await sql`
    SELECT e.user_id, u.display_name, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
           g.metric_direction
    FROM entries e
    JOIN users u ON u.id = e.user_id
    JOIN games g ON g.id = e.game_id
    WHERE e.game_id = ${gameId}
      AND e.superseded_by IS NULL AND e.is_late = false
      AND u.display_name IS NOT NULL
      AND e.puzzle_date <= ${today}::date
  `) as {
    user_id: string;
    display_name: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  // No-peek is a UX/fairness aid, not a security boundary. The viewer is
  // resolved from the session (never a client param).
  const playedToday = rows.some(
    (r) => r.user_id === viewerUserId && r.puzzle_date === today,
  );
  if (isDailyBoardLocked(window, playedToday)) {
    return NextResponse.json({ gameId, window, locked: true, players: [] });
  }

  const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
  const entries: DatedGameEntry[] = rows.map((r) => ({
    playerId: r.user_id,
    gameId,
    variant: r.variant,
    puzzleKey: `${gameId}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
    puzzleDate: r.puzzle_date,
  }));

  const players = computeGameBoard(entries, today, start).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    wins: s.wins,
    gamesPlayed: s.gamesPlayed,
    bestValue: s.bestValue,
    currentStreak: s.currentStreak,
    longestStreak: s.longestStreak,
  }));
  return NextResponse.json({ gameId, window, locked: false, players });
}
