import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { computeMe } from "@/scoring/me";
import { localDateInTz } from "@/lib/day";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;

  const viewer = new URL(req.url).searchParams.get("player") ?? "";

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = localDateInTz(groupRows[0].timezone);

  const gameRows = (await sql`
    SELECT id, name FROM games WHERE group_id = ${groupId} AND active = true
  `) as { id: string; name: string }[];

  const entryRows = (await sql`
    SELECT e.game_id, e.variant, e.puzzle_date::text AS puzzle_date, e.parsed_value, e.solved,
           g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId} AND p.display_name = ${viewer}
      AND e.superseded_by IS NULL AND e.is_late = false
  `) as {
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

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
