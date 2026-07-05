import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { sql } from "@/db/client";
import { resolveViewer } from "@/lib/membership";
import { setDisplayName } from "@/lib/identity";
import { sendAdminJoinNotification } from "@/lib/email";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const viewer = await resolveViewer();
  // "Member" of the global board = an authenticated user who has picked a name.
  return NextResponse.json({
    alreadyMember: viewer?.displayName != null,
    isSuperAdmin: viewer?.isSuperAdmin ?? false,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { displayName?: unknown };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) return NextResponse.json({ error: "displayName required" }, { status: 400 });
  if (displayName.length > 40) {
    return NextResponse.json({ error: "Name must be 40 characters or fewer" }, { status: 400 });
  }

  const result = await setDisplayName(userId, displayName);
  if (!result.ok) return NextResponse.json({ error: "That name is taken — pick another." }, { status: 409 });

  // JWT never carries email — look it up fresh (same source resolveViewer uses).
  const rows = (await sql`SELECT email FROM users WHERE id = ${userId}`) as { email: string | null }[];
  const email = rows[0]?.email;
  if (email) await sendAdminJoinNotification(displayName, email);

  return NextResponse.json({ ok: true });
}
