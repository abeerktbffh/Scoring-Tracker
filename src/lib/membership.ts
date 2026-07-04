import { sql } from "@/db/client";

// Single group for this workstream.
const GROUP_ID = "g1";

export type Viewer = {
  userId: string;
  player: { id: string; displayName: string } | null;
  isAdmin: boolean;
};

export type AuthzNeed = "member" | "admin";

export type AuthzStatus = "ok" | "unauthenticated" | "not-member" | "not-admin";

export type GuardResult =
  | { ok: true; viewer: Viewer }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolves the current viewer's membership + admin status.
 *
 * DB is the source of truth: role/membership are read fresh from the
 * `players` table on every call — NEVER from the session/JWT, which only
 * ever carries `userId`.
 */
export async function resolveViewer(): Promise<Viewer | null> {
  // Imported lazily (rather than at module top-level) so that pure consumers
  // of `authzResult` — e.g. unit tests — never have to load next-auth/Next's
  // request runtime, which this module has no other reason to depend on.
  const { auth } = await import("@/auth/config");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = (await sql`
    SELECT id, display_name, is_admin FROM players
    WHERE group_id = ${GROUP_ID} AND user_id = ${userId}
  `) as { id: string; display_name: string; is_admin: boolean }[];

  const row = rows[0];
  return {
    userId,
    player: row ? { id: row.id, displayName: row.display_name } : null,
    isAdmin: row?.is_admin ?? false,
  };
}

/**
 * Pure decision function — no I/O — kept separate so authorization logic is
 * exhaustively unit-testable without touching the DB or session.
 */
export function authzResult(viewer: Viewer | null, need: AuthzNeed): AuthzStatus {
  if (!viewer) return "unauthenticated";
  if (!viewer.player) return "not-member";
  if (need === "admin" && !viewer.isAdmin) return "not-admin";
  return "ok";
}

function toGuardResult(viewer: Viewer | null, need: AuthzNeed): GuardResult {
  const status = authzResult(viewer, need);
  switch (status) {
    case "ok":
      return { ok: true, viewer: viewer as Viewer };
    case "unauthenticated":
      return { ok: false, status: 401, error: "Unauthenticated" };
    case "not-member":
      return { ok: false, status: 403, error: "Not a member" };
    case "not-admin":
      return { ok: false, status: 403, error: "Admin only" };
  }
}

/** Guard for routes that require any group member. */
export async function requireMember(): Promise<GuardResult> {
  const viewer = await resolveViewer();
  return toGuardResult(viewer, "member");
}

/** Guard for routes that require a group admin. */
export async function requireAdmin(): Promise<GuardResult> {
  const viewer = await resolveViewer();
  return toGuardResult(viewer, "admin");
}
