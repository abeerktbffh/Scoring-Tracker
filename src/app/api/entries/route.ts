import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { sql } from "@/db/client";
import { requireMember } from "@/lib/membership";
import { newId } from "@/lib/ids";
import { localDateInTz } from "@/lib/day";
import { resolveSubmission } from "@/lib/submission";

export const runtime = "nodejs";

const GROUP_ID = "g1";

/**
 * Attributes the entry to the SESSION's player — never to a client-supplied
 * id/displayName. `requireMember` re-resolves membership from the DB on
 * every call, so an unauthenticated caller (401) or authenticated
 * non-member (403) never reaches the insert below.
 */
export async function POST(req: Request) {
  const guard = await requireMember();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const playerId = guard.viewer.player!.id;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

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

  const groupRows = (await sql`SELECT timezone FROM groups WHERE id = ${GROUP_ID}`) as {
    timezone: string;
  }[];
  if (!groupRows[0]) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timezone = groupRows[0].timezone;

  // Verify the game exists in this group.
  const game = (await sql`
    SELECT id FROM games WHERE id = ${resolved.gameId} AND group_id = ${GROUP_ID}
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  // Append-only: supersede any prior active entry for this player/game/variant/day.
  const puzzleDate = localDateInTz(timezone);
  const priorRows = (await sql`
    SELECT id, version FROM entries
    WHERE group_id = ${GROUP_ID} AND player_id = ${playerId} AND game_id = ${resolved.gameId}
      AND puzzle_date = ${puzzleDate} AND (variant IS NOT DISTINCT FROM ${resolved.variant})
      AND superseded_by IS NULL
  `) as { id: string; version: number }[];

  const entryId = newId("e");
  const version = (priorRows[0]?.version ?? 0) + 1;
  await sql`
    INSERT INTO entries (id, group_id, player_id, game_id, variant, puzzle_date,
      puzzle_number, raw_input, parsed_value, solved, is_late, version)
    VALUES (${entryId}, ${GROUP_ID}, ${playerId}, ${resolved.gameId}, ${resolved.variant},
      ${puzzleDate}, ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value},
      ${resolved.solved}, false, ${version})
  `;
  if (priorRows[0]) {
    await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${priorRows[0].id}`;
  }

  return NextResponse.json({ ok: true, parsed: resolved });
}
