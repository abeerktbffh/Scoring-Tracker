import { cookies } from "next/headers";
import { sql } from "@/db/client";
import { verifyGroupToken } from "@/auth/token";
import { verifySecret } from "@/auth/hash";

export async function requireAdmin(
  body: Record<string, unknown>,
): Promise<{ groupId: string } | { error: string; status: number }> {
  const token = cookies().get("group_token")?.value;
  const payload = token ? await verifyGroupToken(token) : null;
  if (!payload) return { error: "Unauthorized", status: 401 };

  const adminPassphrase = body.adminPassphrase;
  if (typeof adminPassphrase !== "string" || adminPassphrase.length === 0) {
    return { error: "Admin passphrase required", status: 403 };
  }
  const rows = (await sql`
    SELECT admin_passphrase_hash FROM groups WHERE id = ${payload.groupId}
  `) as { admin_passphrase_hash: string | null }[];
  const hash = rows[0]?.admin_passphrase_hash;
  if (!hash || !(await verifySecret(adminPassphrase, hash))) {
    return { error: "Wrong admin passphrase", status: 403 };
  }
  return { groupId: payload.groupId };
}
