import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { requireMember } from "@/lib/membership";
import { GROUP_ID } from "@/lib/group";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 40;

/**
 * Self-service rename: a member changes their OWN display name.
 *
 * Identity/target player comes only from `requireMember()` (session ->
 * DB-resolved membership) — never from the request body, so a caller can't
 * rename anyone but themselves.
 */
export async function POST(req: Request) {
  const guard = await requireMember();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { newName } = body as { newName?: string };
  if (typeof newName !== "string" || newName.trim().length === 0) {
    return NextResponse.json({ error: "newName required" }, { status: 400 });
  }
  const name = newName.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `newName must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
  }

  // `requireMember`'s ok:true branch guarantees a linked player (authzResult
  // returns "not-member" otherwise), but guard defensively rather than assert.
  const playerId = guard.viewer.player?.id;
  if (!playerId) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const clash = (await sql`
    SELECT id FROM players WHERE group_id = ${GROUP_ID} AND lower(display_name) = lower(${name}) AND id <> ${playerId}
  `) as { id: string }[];
  if (clash[0]) {
    return NextResponse.json({ error: "That name is taken — pick another." }, { status: 409 });
  }

  await sql`UPDATE players SET display_name = ${name} WHERE id = ${playerId}`;

  return NextResponse.json({ ok: true, displayName: name });
}
