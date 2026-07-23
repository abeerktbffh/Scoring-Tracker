import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireUser, requireMember } from "@/lib/membership";
import { PLATFORM_TZ } from "@/lib/group";
import { computeMe } from "@/scoring/me";
import { computeTodayDetail } from "@/scoring/todayDetail";
import { localDateInTz } from "@/lib/day";
import type { ResultDetail } from "@/parsers/types";

export const runtime = "nodejs";

/**
 * Access is gated by session identity (`requireUser`) by default, not group
 * membership. The catalog of games is global, and "me" entries are scoped to
 * the session's `userId`. `requireUser` re-resolves identity from the DB on
 * every call: no session -> 401.
 *
 * An optional `?group=<id>` scopes both the game catalog and the entries to
 * that group's tracked-active games (and, redundantly but per-spec, the
 * group's membership); access is then gated by `requireMember` (403 for
 * non-members).
 */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("group");
  const guard = groupId ? await requireMember(groupId) : await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Viewer is resolved from the session, not a client-supplied param.
  const viewerUserId = guard.viewer.userId;

  const today = localDateInTz(PLATFORM_TZ);

  const gameRows = (groupId
    ? await sql`
        SELECT id, name FROM games
        WHERE active = true
          AND id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT id, name FROM games WHERE active = true
      `) as { id: string; name: string }[];

  // Every authenticated user has a userId, so there is always something to
  // attribute "me" entries to — no player-less short-circuit needed.
  const entryRows = (groupId
    ? await sql`
        SELECT e.game_id, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
               g.metric_direction, e.detail, e.created_at::text AS created_at
        FROM entries e
        JOIN games g ON g.id = e.game_id
        WHERE e.user_id = ${viewerUserId} AND e.superseded_by IS NULL AND e.is_late = false
          AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})
          AND e.game_id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT e.game_id, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
               g.metric_direction, e.detail, e.created_at::text AS created_at
        FROM entries e
        JOIN games g ON g.id = e.game_id
        WHERE e.user_id = ${viewerUserId} AND e.superseded_by IS NULL AND e.is_late = false
          AND g.active = true
      `) as {
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
    detail: ResultDetail | null;
    created_at: string;
  }[];

  const games = gameRows.map((g) => ({ id: g.id, name: g.name }));
  const entries = entryRows.map((e) => ({
    gameId: e.game_id,
    variant: e.variant,
    puzzleDate: e.puzzle_date,
    value: e.parsed_value,
    solved: e.solved,
    direction: e.metric_direction,
    detail: e.detail ?? null,
    createdAt: e.created_at,
  }));

  const result = computeMe({ today, games, entries });

  // Today's on-time entries across ALL players for the tracked games — used to
  // compute the viewer's rank among today's field, never scoped to the viewer's
  // own user_id (unlike `entryRows` above).
  const todayEntryRows = (groupId
    ? await sql`
        SELECT e.user_id, e.game_id, e.variant, e.parsed_value, e.solved,
               g.metric_direction, e.detail
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.puzzle_date = ${today}::date
          AND e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL
          AND e.user_id IN (SELECT user_id FROM memberships WHERE group_id = ${groupId})
          AND e.game_id IN (
            SELECT gg.game_id FROM group_games gg
            JOIN games ga ON ga.id = gg.game_id AND ga.active = true
            WHERE gg.group_id = ${groupId}
          )
      `
    : await sql`
        SELECT e.user_id, e.game_id, e.variant, e.parsed_value, e.solved,
               g.metric_direction, e.detail
        FROM entries e
        JOIN users u ON u.id = e.user_id
        JOIN games g ON g.id = e.game_id
        WHERE e.puzzle_date = ${today}::date
          AND e.superseded_by IS NULL AND e.is_late = false
          AND u.display_name IS NOT NULL
          AND g.active = true
      `) as {
    user_id: string;
    game_id: string;
    variant: string | null;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
    detail: ResultDetail | null;
  }[];

  const todayDetail = computeTodayDetail({
    games,
    entries: todayEntryRows.map((r) => ({
      playerId: r.user_id,
      gameId: r.game_id,
      variant: r.variant,
      value: r.parsed_value,
      solved: r.solved,
      direction: r.metric_direction,
      detail: r.detail ?? null,
    })),
    viewerId: viewerUserId,
  });

  return NextResponse.json({ ...result, todayDetail, displayName: guard.viewer.displayName ?? null });
}
