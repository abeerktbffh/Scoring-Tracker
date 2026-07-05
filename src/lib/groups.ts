import { sql } from "@/db/client";
import { newId } from "@/lib/ids";
import { generateInviteToken } from "@/lib/inviteToken";

const MAX_NAME_LENGTH = 40;

export async function createGroup(
  userId: string,
  name: string,
  gameIds: string[],
): Promise<{ ok: true; id: string; token: string } | { ok: false; reason: "invalid-name" }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid-name" };

  const groupId = newId("grp");
  const { token, tokenHash } = generateInviteToken();
  await sql`INSERT INTO groups (id, name, created_by, invite_token_hash) VALUES (${groupId}, ${trimmed}, ${userId}, ${tokenHash})`;
  await sql`INSERT INTO memberships (id, group_id, user_id, role) VALUES (${newId("mem")}, ${groupId}, ${userId}, 'admin')`;
  // Only track games that exist in the active catalog; ignore unknown ids.
  for (const gameId of gameIds) {
    await sql`INSERT INTO group_games (group_id, game_id) SELECT ${groupId}, id FROM games WHERE id = ${gameId} AND active = true ON CONFLICT DO NOTHING`;
  }
  return { ok: true, id: groupId, token };
}

export async function listMyGroups(
  userId: string,
): Promise<{ id: string; name: string; role: "admin" | "member" }[]> {
  const rows = (await sql`
    SELECT g.id, g.name, m.role FROM memberships m
    JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = ${userId}
    ORDER BY g.name
  `) as { id: string; name: string; role: "admin" | "member" }[];
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
}
