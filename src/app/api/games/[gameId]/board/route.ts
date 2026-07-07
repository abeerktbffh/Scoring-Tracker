import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser, requireMember } from "@/lib/membership";
import { PLATFORM_TZ } from "@/lib/group";
import { type DatedGameEntry } from "@/scoring/gameBoard";
import { computeDailyContest, computeMedalBoard, type Medal } from "@/scoring/medals";
import { isDailyBoardLocked } from "@/scoring/noPeek";
import { localDateInTz } from "@/lib/day";
import { windowStart, type Window } from "@/lib/window";
import { formatResult } from "@/lib/formatResult";
import type { ResultDetail } from "@/parsers/types";

export const runtime = "nodejs";

const WINDOWS: Window[] = ["daily", "weekly", "monthly", "all"];

/**
 * The board is global by default: access is gated by session identity
 * (`requireUser`), not group membership. `requireUser` re-resolves identity
 * from the DB on every call: no session -> 401.
 *
 * An optional `?group=<id>` scopes the board to that group's members and
 * tracked-active games; access is then gated by `requireMember` (403 for
 * non-members). No-peek always stays keyed on the viewer's global play for
 * the day, never the group-scoped row set.
 */
export async function GET(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const groupId = new URL(req.url).searchParams.get("group");
  const guard = groupId ? await requireMember(groupId) : await requireUser();
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
  const rows = (groupId
    ? await sql`
        SELECT e.user_id, u.display_name, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
               e.detail, g.metric_direction
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.game_id = ${gameId}
          AND e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL
          AND e.puzzle_date <= ${today}::date
          AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})
          AND e.game_id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT e.user_id, u.display_name, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
               e.detail, g.metric_direction
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
    detail: ResultDetail | null;
    metric_direction: "lower_better" | "higher_better";
  }[];

  // No-peek is a UX/fairness aid, not a security boundary. The viewer is
  // resolved from the session (never a client param).
  //
  // "Played today" is a GLOBAL fact about the viewer for this game,
  // independent of the group members/tracked-games filter applied to `rows`
  // above — derived from a dedicated query keyed only on the viewer's own
  // user_id and gameId, never from the (possibly group-filtered) `rows`.
  const playedRows = (await sql`
    SELECT 1 FROM entries
    WHERE user_id = ${viewerUserId} AND game_id = ${gameId} AND puzzle_date = ${today}::date
      AND superseded_by IS NULL AND is_late = false
    LIMIT 1
  `) as unknown[];
  const playedToday = playedRows.length > 0;
  const viewerName = guard.viewer.displayName ?? null;
  if (isDailyBoardLocked(window, playedToday)) {
    return NextResponse.json({ gameId, window, mode: "daily", locked: true, players: [], viewerName });
  }

  const names = new Map(rows.map((r) => [r.user_id, r.display_name]));
  const detailById = new Map(
    rows.map((r) => [`${r.user_id}|${r.puzzle_date}|${r.variant ?? ""}`, r.detail ?? null]),
  );

  if (window === "daily") {
    // Live contest: today's single puzzle for this game.
    const todays = rows.filter((r) => r.puzzle_date === today);
    const contestEntries = todays.map((r) => ({
      playerId: r.user_id,
      gameId,
      variant: r.variant,
      puzzleKey: `${gameId}|${r.puzzle_date}`,
      value: r.parsed_value,
      solved: r.solved,
      direction: r.metric_direction,
    }));
    const players = computeDailyContest(contestEntries).map((s) => {
      const detail = detailById.get(`${s.playerId}|${today}|${s.variant ?? ""}`) ?? null;
      return {
        displayName: names.get(s.playerId) ?? s.playerId,
        value: s.value,
        valueFormatted: formatResult(gameId, s.value, s.solved, detail),
        solved: s.solved,
        medal: s.medal as Medal | null,
        detail,
        variant: s.variant,
      };
    });
    return NextResponse.json({ gameId, window, mode: "daily", locked: false, players, viewerName });
  }

  const datedEntries: DatedGameEntry[] = rows.map((r) => ({
    playerId: r.user_id,
    gameId,
    variant: r.variant,
    puzzleKey: `${gameId}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
    puzzleDate: r.puzzle_date,
  }));
  const players = computeMedalBoard(datedEntries, start).map((s) => ({
    displayName: names.get(s.playerId) ?? s.playerId,
    gold: s.gold,
    silver: s.silver,
    bronze: s.bronze,
    gamesPlayed: s.gamesPlayed,
    pb: s.pb,
    pbFormatted: s.pb === null ? null : formatResult(gameId, s.pb, true, null),
  }));
  return NextResponse.json({ gameId, window, mode: "aggregate", locked: false, players, viewerName });
}
