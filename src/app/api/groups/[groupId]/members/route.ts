import { NextResponse } from "next/server";
import { requireMember } from "@/lib/membership";
import { listGroupMembers } from "@/lib/groups";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireMember(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  return NextResponse.json({ members: await listGroupMembers(params.groupId) });
}
