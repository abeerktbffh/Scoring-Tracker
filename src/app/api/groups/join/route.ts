import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { joinViaToken } from "@/lib/groups";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });

  const result = await joinViaToken(guard.viewer.userId, token);
  if (!result.ok) return NextResponse.json({ error: "This invite link is invalid." }, { status: 400 });

  return NextResponse.json({ ok: true, groupId: result.groupId });
}
