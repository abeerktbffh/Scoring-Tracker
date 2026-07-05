import { NextResponse } from "next/server";
import { requireGroupAdmin } from "@/lib/membership";
import { removeMember } from "@/lib/groups";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { groupId: string; userId: string } },
) {
  const guard = await requireGroupAdmin(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const result = await removeMember(params.groupId, params.userId);
  return NextResponse.json(result);
}
