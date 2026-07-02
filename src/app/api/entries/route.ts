import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { hashSecret, verifySecret } from "@/auth/hash";
import { newId } from "@/lib/ids";
import { localDateInTz } from "@/lib/day";
import { resolveSubmission } from "@/lib/submission";

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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { displayName, pin } = body as { displayName?: string; pin?: string };
  if (
    typeof displayName !== "string" || displayName.length === 0 ||
    typeof pin !== "string" || pin.length === 0
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const resolved = resolveSubmission(body);
  if ("error" in resolved) {
    if (typeof body.rawInput === "string" && resolved.status === 422) {
      // Surface parser drift: a share text we failed to recognize.
      console.warn("[parse-failure]", body.rawInput.slice(0, 120));
      Sentry.captureMessage(
        "[parse-failure] " + (body.rawInput as string).slice(0, 120),
        "warning",
      );
      // Serverless functions can freeze on return before Sentry finishes
      // sending. Flush so the event actually leaves before we respond.
      // No-ops instantly when no DSN is configured (local/CI).
      await Sentry.flush(2000);
    }
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${groupId}`) as {
    timezone: string;
  }[];
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
    SELECT id FROM games WHERE id = ${resolved.gameId} AND group_id = ${groupId}
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  // Append-only: supersede any prior active entry for this player/game/variant/day.
  const puzzleDate = localDateInTz(timezone);
  const priorRows = (await sql`
    SELECT id, version FROM entries
    WHERE group_id = ${groupId} AND player_id = ${playerId} AND game_id = ${resolved.gameId}
      AND puzzle_date = ${puzzleDate} AND (variant IS NOT DISTINCT FROM ${resolved.variant})
      AND superseded_by IS NULL
  `) as { id: string; version: number }[];

  const entryId = newId("e");
  const version = (priorRows[0]?.version ?? 0) + 1;
  await sql`
    INSERT INTO entries (id, group_id, player_id, game_id, variant, puzzle_date,
      puzzle_number, raw_input, parsed_value, solved, is_late, version)
    VALUES (${entryId}, ${groupId}, ${playerId}, ${resolved.gameId}, ${resolved.variant},
      ${puzzleDate}, ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value},
      ${resolved.solved}, false, ${version})
  `;
  if (priorRows[0]) {
    await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${priorRows[0].id}`;
  }

  return NextResponse.json({ ok: true, parsed: resolved });
}
