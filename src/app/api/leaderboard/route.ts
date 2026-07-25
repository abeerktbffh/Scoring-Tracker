import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser, requireMember } from "@/lib/membership";
import { PLATFORM_TZ } from "@/lib/group";
import { computeOverallMedals } from "@/scoring/medals";
import type { GameEntry } from "@/scoring/wins";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

/**
 * The board is global by default: access is gated by session identity
 * (`requireUser`), not group membership. `requireUser` re-resolves identity
 * from the DB on every call: no session -> 401.
 *
 * An optional `?group=<id>` scopes the board to that group's members and
 * tracked-active games; access is then gated by `requireMember` (403 for
 * non-members).
 *
 * The Overall board is never no-peek gated (M007): it shows every player's
 * honest participation (games played) and the day's medal leaders regardless
 * of what the viewer has played, and is never locked. No-peek stays only on
 * the per-game board, which reveals exact scores.
 */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("group");
  const guard = groupId ? await requireMember(groupId) : await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const param = new URL(req.url).searchParams.get("window");
  const window: Window = WINDOWS.includes(param as Window) ? (param as Window) : "daily";
  const today = localDateInTz(PLATFORM_TZ);
  const start = windowStart(window, today);

  const rows = (groupId
    ? await sql`
        SELECT e.user_id, u.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
               e.parsed_value, e.solved, g.metric_direction
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL AND g.active = true
          AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
          AND e.puzzle_date <= ${today}::date
          AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})
          AND e.game_id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT e.user_id, u.display_name, e.game_id, e.variant, e.puzzle_date::text AS puzzle_date,
               e.parsed_value, e.solved, g.metric_direction
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL AND g.active = true
          AND (${start}::date IS NULL OR e.puzzle_date >= ${start}::date)
          AND e.puzzle_date <= ${today}::date
      `) as {
    user_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
  const gameEntries: GameEntry[] = rows.map((r) => ({
    playerId: r.user_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = computeOverallMedals(gameEntries).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    gold: s.gold,
    silver: s.silver,
    bronze: s.bronze,
    gamesPlayed: s.gamesPlayed,
    gamesLed: s.gamesLed, // gameIds; the client maps ids→names via its games catalog
  }));
  return NextResponse.json({ window, locked: false, players, viewerName: guard.viewer.displayName ?? null });
}
