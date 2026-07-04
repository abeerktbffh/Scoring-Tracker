import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { sql } from "@/db/client";
import { requireUser } from "@/lib/membership";
import { newId } from "@/lib/ids";
import { localDateInTz } from "@/lib/day";
import { PLATFORM_TZ } from "@/lib/group";
import { resolveSubmission, type ResolvedSubmission } from "@/lib/submission";

export const runtime = "nodejs";

interface NeonDbErrorLike {
  code?: string;
  constraint?: string;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}

/**
 * Supersedes any prior active entry for this user/game/variant/day, then
 * inserts the new one. Superseding happens BEFORE the insert so the partial
 * unique index `entries_active_uq` never has two active rows for the same
 * slot to conflict on.
 *
 * Concurrency: the Neon HTTP driver is stateless (no interactive
 * transactions / no `FOR UPDATE`), so a concurrent request can race between
 * the prior-read and the insert. Rather than check-then-write, we rely on
 * `entries_active_uq` to reject the loser and retry once, re-reading the
 * now-present prior row so the retry's supersede/insert sees a consistent
 * state.
 */
async function supersedeAndInsert(
  userId: string,
  resolved: ResolvedSubmission,
  puzzleDate: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const prior = (await sql`
      SELECT id, version FROM entries
      WHERE user_id = ${userId} AND game_id = ${resolved.gameId} AND puzzle_date = ${puzzleDate}
        AND (variant IS NOT DISTINCT FROM ${resolved.variant}) AND superseded_by IS NULL
    `) as { id: string; version: number }[];
    const entryId = newId("e");
    const version = (prior[0]?.version ?? 0) + 1;
    try {
      // Supersede FIRST so the partial unique index has no active duplicate at insert time.
      if (prior[0]) {
        await sql`UPDATE entries SET superseded_by = ${entryId} WHERE id = ${prior[0].id} AND superseded_by IS NULL`;
      }
      await sql`
        INSERT INTO entries (id, user_id, game_id, variant, puzzle_date, puzzle_number, raw_input, parsed_value, solved, is_late, version)
        VALUES (${entryId}, ${userId}, ${resolved.gameId}, ${resolved.variant}, ${puzzleDate},
          ${resolved.puzzleNumber}, ${resolved.rawInput}, ${resolved.value}, ${resolved.solved}, false, ${version})
      `;
      return;
    } catch (err) {
      if (isUniqueViolation(err, "entries_active_uq") && attempt === 0) continue; // race: re-read prior and retry
      throw err;
    }
  }
}

/**
 * Attributes the entry to the SESSION's user — never to a client-supplied
 * id. `requireUser` re-resolves identity from the DB on every call, so an
 * unauthenticated caller (401) never reaches the insert below.
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const userId = guard.viewer.userId;

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

  // Verify the game exists in the catalog (no group filter — catalog is global).
  const game = (await sql`
    SELECT id FROM games WHERE id = ${resolved.gameId} AND active = true
  `) as { id: string }[];
  if (!game[0]) return NextResponse.json({ error: "Unknown game" }, { status: 422 });

  const puzzleDate = localDateInTz(PLATFORM_TZ);
  await supersedeAndInsert(userId, resolved, puzzleDate);

  return NextResponse.json({ ok: true, parsed: resolved });
}
