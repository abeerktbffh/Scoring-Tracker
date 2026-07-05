import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { createGroup, listMyGroups } from "@/lib/groups";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; gameIds?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const gameIds = Array.isArray(body.gameIds)
    ? body.gameIds.filter((g): g is string => typeof g === "string")
    : [];

  const result = await createGroup(guard.viewer.userId, name, gameIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Enter a group name (1–40 characters)." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({ id: result.id, link: `${origin}/?join=${result.token}` }, { status: 201 });
}

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  return NextResponse.json({ groups: await listMyGroups(guard.viewer.userId) });
}
