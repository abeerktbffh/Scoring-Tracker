import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { tallyWins, type GameEntry } from "@/scoring/wins";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groupId = payload.groupId;

  const puzzleDate = new Date().toISOString().slice(0, 10);
  const rows = (await sql`
    SELECT e.player_id, p.display_name, e.game_id, e.variant, e.puzzle_date,
           e.puzzle_number, e.parsed_value, e.solved, g.metric_direction
    FROM entries e
    JOIN players p ON p.id = e.player_id
    JOIN games g ON g.id = e.game_id
    WHERE e.group_id = ${groupId} AND e.puzzle_date = ${puzzleDate}
      AND e.superseded_by IS NULL AND e.is_late = false
  `) as {
    player_id: string;
    display_name: string;
    game_id: string;
    variant: string | null;
    puzzle_date: string;
    puzzle_number: number | null;
    parsed_value: number;
    solved: boolean;
    metric_direction: "lower_better" | "higher_better";
  }[];

  const names = new Map(rows.map((r) => [r.player_id, r.display_name]));
  const gameEntries: GameEntry[] = rows.map((r) => ({
    playerId: r.player_id,
    gameId: r.game_id,
    variant: r.variant,
    puzzleKey: r.puzzle_number != null ? `${r.game_id}|${r.puzzle_number}` : `${r.game_id}|${r.puzzle_date}`,
    value: r.parsed_value,
    solved: r.solved,
    direction: r.metric_direction,
  }));

  const players = tallyWins(gameEntries).map((w) => ({
    displayName: names.get(w.playerId) ?? w.playerId,
    wins: w.wins,
  }));
  return NextResponse.json({ players });
}
