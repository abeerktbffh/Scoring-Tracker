import { NextResponse } from "next/server";
import { requireMember } from "@/lib/membership";
import { leaveGroup } from "@/lib/groups";

export const runtime = "nodejs";

/**
 * Any member (admin or member) may leave — this is why we gate on
 * `requireMember`, not `requireGroupAdmin`. An admin removing themselves via
 * this route is the supported self-service path (vs. admins removing
 * *other* members via the members/[userId] DELETE route).
 */
export async function POST(_req: Request, { params }: { params: { groupId: string } }) {
  const guard = await requireMember(params.groupId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const result = await leaveGroup(guard.viewer.userId, params.groupId);
  return NextResponse.json(result);
}
