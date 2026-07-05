import { NextResponse } from "next/server";
import { requireGroupAdmin } from "@/lib/membership";
import { setGroupGames } from "@/lib/groups";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { gameIds?: unknown };
  const gameIds = Array.isArray(body.gameIds)
    ? body.gameIds.filter((g): g is string => typeof g === "string")
    : [];

  const result = await setGroupGames(params.groupId, gameIds);
  return NextResponse.json(result);
}
