import { NextResponse } from "next/server";
import { requireUser } from "@/lib/membership";
import { groupPreviewByToken } from "@/lib/groups";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const group = await groupPreviewByToken(token);
  if (!group) return NextResponse.json({ error: "This invite link is invalid." }, { status: 404 });

  return NextResponse.json({ group });
}
