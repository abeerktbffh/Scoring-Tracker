import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { setDisplayName } from "@/lib/identity";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 40;

/**
 * Self-service rename: a user changes their OWN global display name
 * (`users.display_name`).
 *
 * Identity/target comes only from `requireUser()` (session -> DB-resolved
 * viewer) — never from the request body, so a caller can't rename anyone
 * but themselves. Case-insensitive global uniqueness is enforced by
 * `setDisplayName` (lib/identity).
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { newName?: unknown };
  const raw = typeof body.newName === "string" ? body.newName.trim() : "";
  if (!raw) return NextResponse.json({ error: "newName required" }, { status: 400 });
  if (raw.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `newName must be ${MAX_NAME_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const result = await setDisplayName(guard.viewer.userId, raw);
  if (!result.ok) {
    return NextResponse.json({ error: "That name is taken — pick another." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, displayName: raw });
}
