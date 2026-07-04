import { sql } from "@/db/client";

interface NeonDbErrorLike { code?: string; constraint?: string }
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}

/** True iff another user already holds this name (case-insensitive). */
export async function nameClashExists(name: string, excludeUserId?: string): Promise<boolean> {
  const rows = excludeUserId
    ? ((await sql`SELECT id FROM users WHERE lower(display_name) = lower(${name}) AND id <> ${excludeUserId}`) as { id: string }[])
    : ((await sql`SELECT id FROM users WHERE lower(display_name) = lower(${name})`) as { id: string }[]);
  return rows.length > 0;
}

/**
 * Sets a user's global display name. Pre-checks for a clash for a clean
 * result, and catches the `users_display_name_lower_uq` violation as a race
 * backstop (same pattern as lib/claims.ts) so concurrency never 500s.
 */
export async function setDisplayName(
  userId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; reason: "name-taken" }> {
  if (await nameClashExists(name, userId)) return { ok: false, reason: "name-taken" };
  try {
    await sql`UPDATE users SET display_name = ${name} WHERE id = ${userId}`;
  } catch (err) {
    if (isUniqueViolation(err, "users_display_name_lower_uq")) return { ok: false, reason: "name-taken" };
    throw err;
  }
  return { ok: true };
}
