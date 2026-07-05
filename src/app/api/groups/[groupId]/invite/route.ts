import { NextResponse } from "next/server";
import { requireGroupAdmin, requireMember } from "@/lib/membership";
import { resetInvite, getGroupInvite } from "@/lib/groups";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireMember(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const invite = await getGroupInvite(params.groupId);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = new URL(req.url).origin;
  return NextResponse.json({ link: `${origin}/?join=${invite.token}` });
}

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { token } = await resetInvite(params.groupId);
  const origin = new URL(req.url).origin;
  return NextResponse.json({ link: `${origin}/?join=${token}` });
}
