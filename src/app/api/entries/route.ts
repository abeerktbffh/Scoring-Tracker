import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { hashSecret, verifySecret } from "@/auth/hash";
import { detectAndParse } from "@/parsers/registry";
import { newId } from "@/lib/ids";
import { localDateInTz } from "@/lib/day";

export const runtime = "nodejs";

async function requireGroup(): Promise<string | null> {
  const token = cookies().get("group_token")?.value;
  if (!token) return null;
  const payload = await verifyGroupToken(token);
  return payload?.groupId ?? null;
}

export async function POST(req: Request) {
  const groupId = await requireGroup();
  if (!groupId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { displayName, pin, rawInput } = body as {
    displayName?: string;
    pin?: string;
    rawInput?: string;
  };
  if (
    typeof displayName !== "string" || displayName.length === 0 ||
    typeof pin !== "string" || pin.length === 0 ||
    typeof rawInput !== "string" || rawInput.length === 0
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const parsed = detectAndParse(rawInput);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse result" }, { status: 422 });
  }

  // Resolve the group's timezone so the puzzle-day is filed in local time.
  const groupRows = (await sql`
    SELECT timezone FROM groups WHERE id = ${groupId}
  `) as { timezone: string }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timezone = groupRows[0].timezone;

  // Find or create the player, enforcing PIN.
  const existing = (await sql`
    SELECT id, pin_hash FROM players WHERE group_id = ${groupId} AND display_name = ${displayName}
  `) as { id: string; pin_hash: string }[];

  let playerId: string;
  if (existing[0]) {
    if (!(await verifySecret(pin, existing[0].pin_hash))) {
      return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });
    }
    playerId = existing[0].id;
  } else {
    playerId = newId("p");
    await sql`
      INSERT INTO players (id, group_id, display_name, pin_hash)
      VALUES (${playerId}, ${groupId}, ${displayName}, ${await hashSecret(pin)})
    `;
  }

  // Verify the game exists in this group.
  const game = (await sql`
    SELECT id FROM games WHERE id = ${parsed.gameId} AND group_id = ${groupId}
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  // Append-only: supersede any prior active entry for this player/game/variant/day.
  const puzzleDate = localDateInTz(timezone);
  const priorRows = (await sql`
    SELECT id, version FROM entries
    WHERE group_id = ${groupId} AND player_id = ${playerId} AND game_id = ${parsed.gameId}
      AND puzzle_date = ${puzzleDate} AND (variant IS NOT DISTINCT FROM ${parsed.variant})
      AND superseded_by IS NULL
  `) as { id: string; version: number }[];

  const entryId = newId("e");
  const version = (priorRows[0]?.version ?? 0) + 1;
  await sql`
    INSERT INTO entries (id, group_id, player_id, game_id, variant, puzzle_date,
      puzzle_number, raw_input, parsed_value, solved, is_late, version)
    VALUES (${entryId}, ${groupId}, ${playerId}, ${parsed.gameId}, ${parsed.variant},
      ${puzzleDate}, ${parsed.puzzleNumber}, ${rawInput}, ${parsed.value}, ${parsed.solved}, false, ${version})
  `;
  if (priorRows[0]) {
    await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${priorRows[0].id}`;
  }

  return NextResponse.json({ ok: true, parsed });
}
