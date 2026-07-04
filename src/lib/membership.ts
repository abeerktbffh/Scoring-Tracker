import { sql } from "@/db/client";

export type Viewer = {
  userId: string;
  displayName: string | null;
  isSuperAdmin: boolean;
};

export type AuthzNeed = "user" | "super-admin";
export type AuthzStatus = "ok" | "unauthenticated" | "not-super-admin";

export type GuardResult =
  | { ok: true; viewer: Viewer }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolves the current viewer's global identity. DB is the source of truth:
 * name and super-admin are read fresh from `users` on every call — never from
 * the session/JWT, which only carries `userId`. Global membership is implicit:
 * any authenticated user is a "member" of the global board.
 */
export async function resolveViewer(): Promise<Viewer | null> {
  const { auth } = await import("@/auth/config");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = (await sql`
    SELECT display_name, is_super_admin FROM users WHERE id = ${userId}
  `) as { display_name: string | null; is_super_admin: boolean }[];
  const row = rows[0];
  return {
    userId,
    displayName: row?.display_name ?? null,
    isSuperAdmin: row?.is_super_admin ?? false,
  };
}

/** Pure decision function — no I/O — exhaustively unit-testable. */
export function authzResult(viewer: Viewer | null, need: AuthzNeed): AuthzStatus {
  if (!viewer) return "unauthenticated";
  if (need === "super-admin" && !viewer.isSuperAdmin) return "not-super-admin";
  return "ok";
}

function toGuardResult(viewer: Viewer | null, need: AuthzNeed): GuardResult {
  const status = authzResult(viewer, need);
  switch (status) {
    case "ok":
      return { ok: true, viewer: viewer as Viewer };
    case "unauthenticated":
      return { ok: false, status: 401, error: "Unauthenticated" };
    case "not-super-admin":
      return { ok: false, status: 403, error: "Admin only" };
  }
}

/** Guard for routes that require any authenticated user (the global board). */
export async function requireUser(): Promise<GuardResult> {
  return toGuardResult(await resolveViewer(), "user");
}

/** Guard for platform-owner-only routes (catalog management, admin panel). */
export async function requireSuperAdmin(): Promise<GuardResult> {
  return toGuardResult(await resolveViewer(), "super-admin");
}
