import { NextResponse } from "next/server";
import { requireGroupAdmin } from "@/lib/membership";
import { resetInvite } from "@/lib/groups";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { token } = await resetInvite(params.groupId);
  const origin = new URL(req.url).origin;
  return NextResponse.json({ link: `${origin}/?join=${token}` });
}
