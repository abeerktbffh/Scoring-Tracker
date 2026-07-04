import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireMember } from "@/lib/membership";
import { GROUP_ID } from "@/lib/group";
import { computeMe } from "@/scoring/me";
import { localDateInTz } from "@/lib/day";

export const runtime = "nodejs";

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

  // Viewer is resolved from the session, not a client-supplied param.
  const viewerPlayerId = guard.viewer.player?.id ?? null;

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);

  const gameRows = (await sql`
    SELECT id, name FROM games WHERE group_id = ${groupId} AND active = true
  `) as { id: string; name: string }[];

  // With no session player, there is nothing to attribute "me" entries to.
  const entryRows = viewerPlayerId
    ? ((await sql`
        SELECT e.game_id, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
               g.metric_direction
        FROM entries e
        JOIN games g ON g.id = e.game_id
        WHERE e.group_id = ${groupId} AND e.player_id = ${viewerPlayerId}
          AND e.superseded_by IS NULL AND e.is_late = false
      `) as {
        game_id: string;
        variant: string | null;
        puzzle_date: string;
        parsed_value: number;
        solved: boolean;
        metric_direction: "lower_better" | "higher_better";
      }[])
    : [];

  const games = gameRows.map((g) => ({ id: g.id, name: g.name }));
  const entries = entryRows.map((e) => ({
    gameId: e.game_id,
    variant: e.variant,
    puzzleDate: e.puzzle_date,
    value: e.parsed_value,
    solved: e.solved,
    direction: e.metric_direction,
  }));

  const result = computeMe({ today, games, entries });
  return NextResponse.json(result);
}
