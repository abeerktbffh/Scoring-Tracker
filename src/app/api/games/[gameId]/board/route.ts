import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { computeGameBoard, type DatedGameEntry } from "@/scoring/gameBoard";
import { isDailyBoardLocked } from "@/scoring/noPeek";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

export async function GET(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;
  const gameId = params.gameId;

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";
  const viewer = new URL(req.url).searchParams.get("player") ?? "";

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);
  const start = windowStart(window, today);

  // Fetch ALL of the game's on-time active entries (streaks are all-time).
  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
           g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId} AND e.game_id = ${gameId}
      AND e.superseded_by IS NULL AND e.is_late = false
      AND e.puzzle_date <= ${today}::date
  `) as {
    player_id: string;
    display_name: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  // No-peek is a UX/fairness aid, not a security boundary: the viewer is an unauthenticated display-name param and this only ever restricts (never widens) what is shown.
  const playedToday = rows.some(
    (r) => r.display_name === viewer && r.puzzle_date === today,
  );
  if (isDailyBoardLocked(window, playedToday)) {
    return NextResponse.json({ gameId, window, locked: true, players: [] });
  }

  const names = new Map(rows.map((r) => [r.player_id, r.display_name]));
  const entries: DatedGameEntry[] = rows.map((r) => ({
    playerId: r.player_id,
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
