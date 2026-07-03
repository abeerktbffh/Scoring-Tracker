import { randomBytes, createHash } from "node:crypto";
import { sql } from "@/db/client";
import { newId } from "@/lib/ids";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type InviteStatus = "ok" | "expired" | "revoked" | "exhausted";

export interface InviteRow {
  revoked: boolean;
  expires_at: string | Date;
  uses: number;
  max_uses: number | null;
}

/** Generates a fresh invite token and its hash. The raw token is shown once and never stored. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** Deterministic one-way hash of an invite token (sha256 hex, 64 chars). */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Pure classification of an invite row's current status. Order matters:
 * a revoked invite is reported as revoked even if also expired/exhausted;
 * an expired invite is reported as expired even if also exhausted.
 */
export function classifyInvite(row: InviteRow, nowMs: number): InviteStatus {
  if (row.revoked) return "revoked";
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (nowMs >= expiresAtMs) return "expired";
  if (row.max_uses != null && row.uses >= row.max_uses) return "exhausted";
  return "ok";
}

/** Creates a new invite for a group and returns the raw token (never stored/logged). */
export async function createInvite(
  groupId: string,
  createdBy: string,
  opts?: { ttlMs?: number; maxUses?: number },
): Promise<{ token: string }> {
  const { token, tokenHash } = newInviteToken();
  const id = newId("inv");
  const expiresAt = new Date(Date.now() + (opts?.ttlMs ?? DEFAULT_TTL_MS));
  const maxUses = opts?.maxUses ?? null;

  await sql`
    INSERT INTO invites (id, group_id, token_hash, created_by, expires_at, max_uses)
    VALUES (${id}, ${groupId}, ${tokenHash}, ${createdBy}, ${expiresAt.toISOString()}, ${maxUses})
  `;

  return { token };
}

/**
 * Validates a raw invite token: looks it up by hash (single indexed row lookup,
 * so no timing oracle on invalid vs. valid tokens) and classifies its status.
 */
export async function validateInvite(
  token: string,
): Promise<
  | { ok: true; inviteId: string; groupId: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "exhausted" }
> {
  const tokenHash = hashInviteToken(token);
  const rows = (await sql`
    SELECT id, group_id, revoked, expires_at, uses, max_uses
    FROM invites
    WHERE token_hash = ${tokenHash}
  `) as {
    id: string;
    group_id: string;
    revoked: boolean;
    expires_at: string;
    uses: number;
    max_uses: number | null;
  }[];

  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };

  const status = classifyInvite(row, Date.now());
  if (status !== "ok") return { ok: false, reason: status };

  return { ok: true, inviteId: row.id, groupId: row.group_id };
}

/** Records a redemption of the invite. */
export async function consumeInvite(inviteId: string): Promise<void> {
  await sql`UPDATE invites SET uses = uses + 1 WHERE id = ${inviteId}`;
}
