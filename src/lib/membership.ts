import { sql } from "@/db/client";
import { hashImportToken } from "@/lib/importToken";

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

/**
 * Resolves a viewer from a raw import token by its hash. DB is the source of
 * truth (name/super-admin read fresh), exactly like `resolveViewer`. Returns
 * null when the token matches no user.
 */
export async function resolveViewerByImportToken(token: string): Promise<Viewer | null> {
  const hash = hashImportToken(token);
  const rows = (await sql`
    SELECT id, display_name, is_super_admin FROM users WHERE import_token_hash = ${hash}
  `) as { id: string; display_name: string | null; is_super_admin: boolean }[];
  const row = rows[0];
  if (!row) return null;
  return { userId: row.id, displayName: row.display_name ?? null, isSuperAdmin: row.is_super_admin ?? false };
}

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/**
 * Guard for endpoints reachable by either a browser session OR a per-user
 * import token. An `Authorization: Bearer <token>` header is resolved via the
 * token (unknown token → 401, never a silent session fallthrough); with no
 * bearer header it delegates to the session guard `requireUser()`.
 */
export async function requireUserOrImportToken(req: Request): Promise<GuardResult> {
  const m = req.headers.get("authorization")?.match(BEARER_RE);
  if (m) return toGuardResult(await resolveViewerByImportToken(m[1]), "user");
  return requireUser();
}

/** Pure decision function — no I/O — exhaustively unit-testable. */
export function roleFor(rows: { role: string }[]): "admin" | "member" | null {
  const r = rows[0]?.role;
  return r === "admin" || r === "member" ? r : null;
}

async function resolveGroupRole(
  groupId: string
): Promise<{ viewer: Viewer; role: "admin" | "member" | null } | null> {
  const viewer = await resolveViewer();
  if (!viewer) return null;
  const rows = (await sql`
    SELECT role FROM memberships WHERE group_id = ${groupId} AND user_id = ${viewer.userId}
  `) as { role: string }[];
  return { viewer, role: roleFor(rows) };
}

/** Guard for routes scoped to a group: any member (admin or member) may proceed. */
export async function requireMember(groupId: string): Promise<GuardResult> {
  const r = await resolveGroupRole(groupId);
  if (!r) return { ok: false, status: 401, error: "Unauthenticated" };
  if (r.role === null) return { ok: false, status: 403, error: "Not a member" };
  return { ok: true, viewer: r.viewer };
}

/** Guard for group-admin-only routes (e.g. managing that group's members). */
export async function requireGroupAdmin(groupId: string): Promise<GuardResult> {
  const r = await resolveGroupRole(groupId);
  if (!r) return { ok: false, status: 401, error: "Unauthenticated" };
  if (r.role !== "admin") return { ok: false, status: 403, error: "Admin only" };
  return { ok: true, viewer: r.viewer };
}
