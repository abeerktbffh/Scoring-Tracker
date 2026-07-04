import { sql } from "@/db/client";
import { newId } from "@/lib/ids";

/**
 * Minimal player shape needed to decide claimability — kept separate from the
 * full DB row so `canClaim` stays a pure, dependency-free function.
 */
export interface ClaimablePlayer {
  userId: string | null;
  archived: boolean;
}

export type CreateClaimReason = "already-pending" | "already-member" | "one-claim-at-a-time";
export type ApproveClaimReason = "already-resolved" | "already-member" | "not-found";

interface NeonDbErrorLike {
  code?: string;
  constraint?: string;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}

/**
 * Pure decision function — no I/O — so the claim eligibility rule is
 * exhaustively unit-testable without touching the DB.
 *
 * A claim is allowed only when all of the following hold:
 * - the player is not archived
 * - the player is not already linked to a user
 * - the claiming user does not already have a player in the group
 * - there is no pending claim on the player
 */
export function canClaim(
  player: ClaimablePlayer,
  existingUserPlayer: boolean,
  pendingExists: boolean,
): boolean {
  if (player.archived) return false;
  if (player.userId !== null) return false;
  if (existingUserPlayer) return false;
  if (pendingExists) return false;
  return true;
}

/** Legacy players in a group that are still eligible to be claimed. */
export async function unclaimedLegacyPlayers(
  groupId: string,
): Promise<{ id: string; displayName: string }[]> {
  const rows = (await sql`
    SELECT id, display_name FROM players
    WHERE group_id = ${groupId} AND user_id IS NULL AND archived = false
  `) as { id: string; display_name: string }[];
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

/**
 * Creates a pending claim linking `userId` to legacy `playerId`.
 *
 * Concurrency: the Neon HTTP driver has no interactive transactions, so
 * atomicity for the "one pending claim per player" rule comes from the DB's
 * `claims_one_pending_per_player` partial unique index — we optimistically
 * INSERT and catch the violation rather than check-then-insert.
 */
export async function createPendingClaim(
  userId: string,
  playerId: string,
): Promise<{ ok: true } | { ok: false; reason: CreateClaimReason }> {
  const playerRows = (await sql`
    SELECT group_id, user_id, archived FROM players WHERE id = ${playerId}
  `) as { group_id: string; user_id: string | null; archived: boolean }[];
  const player = playerRows[0];
  if (!player || player.user_id !== null || player.archived) {
    return { ok: false, reason: "already-pending" };
  }

  const groupId = player.group_id;

  const existingMemberRows = (await sql`
    SELECT id FROM players WHERE group_id = ${groupId} AND user_id = ${userId}
  `) as { id: string }[];
  if (existingMemberRows.length > 0) {
    return { ok: false, reason: "already-member" };
  }

  const pendingByUserRows = (await sql`
    SELECT c.id FROM claims c
    JOIN players p ON p.id = c.player_id
    WHERE c.claim_status = 'pending' AND c.claimed_by_user_id = ${userId} AND p.group_id = ${groupId}
  `) as { id: string }[];
  if (pendingByUserRows.length > 0) {
    return { ok: false, reason: "one-claim-at-a-time" };
  }

  const id = newId("claim");
  try {
    await sql`
      INSERT INTO claims (id, group_id, player_id, claimed_by_user_id, claim_status)
      VALUES (${id}, ${groupId}, ${playerId}, ${userId}, 'pending')
    `;
  } catch (err) {
    if (isUniqueViolation(err, "claims_one_pending_per_player")) {
      return { ok: false, reason: "already-pending" };
    }
    throw err;
  }

  return { ok: true };
}

export interface PendingClaim {
  id: string;
  playerId: string;
  playerDisplayName: string;
  claimedByUserId: string;
  claimedByEmail: string | null;
  claimedAt: string;
}

/** All pending claims for a group, for admin review. */
export async function listPendingClaims(groupId: string): Promise<PendingClaim[]> {
  const rows = (await sql`
    SELECT c.id, c.player_id, p.display_name AS player_display_name,
           c.claimed_by_user_id, u.email AS claimed_by_email, c.claimed_at
    FROM claims c
    JOIN players p ON p.id = c.player_id
    JOIN users u ON u.id = c.claimed_by_user_id
    WHERE c.group_id = ${groupId} AND c.claim_status = 'pending'
    ORDER BY c.claimed_at ASC
  `) as {
    id: string;
    player_id: string;
    player_display_name: string;
    claimed_by_user_id: string;
    claimed_by_email: string | null;
    claimed_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    playerDisplayName: r.player_display_name,
    claimedByUserId: r.claimed_by_user_id,
    claimedByEmail: r.claimed_by_email,
    claimedAt: r.claimed_at,
  }));
}

/**
 * Approves a pending claim, linking the player to the claiming user.
 *
 * Concurrency: rather than reading the player then writing (which would
 * race against a concurrent approval/archive on the stateless HTTP driver),
 * the link is performed as a single atomic conditional UPDATE guarded by
 * `user_id IS NULL AND archived = false`. If another approval or an archive
 * won the race, 0 rows come back and we report `already-resolved` without
 * ever marking this claim approved. A `players_group_user_uq` violation
 * (the user was linked to a different player in the group in the meantime)
 * is caught and reported as `already-member`.
 */
export async function approveClaim(
  claimId: string,
  adminUserId: string,
): Promise<
  | { ok: true; playerName: string; userEmail: string | null }
  | { ok: false; reason: ApproveClaimReason }
> {
  const claimRows = (await sql`
    SELECT id, player_id, claimed_by_user_id, claim_status FROM claims WHERE id = ${claimId}
  `) as { id: string; player_id: string; claimed_by_user_id: string; claim_status: string }[];
  const claim = claimRows[0];
  if (!claim || claim.claim_status !== "pending") {
    return { ok: false, reason: "not-found" };
  }

  let updatedRows: { id: string }[];
  try {
    updatedRows = (await sql`
      UPDATE players SET user_id = ${claim.claimed_by_user_id}
      WHERE id = ${claim.player_id} AND user_id IS NULL AND archived = false
      RETURNING id
    `) as { id: string }[];
  } catch (err) {
    if (isUniqueViolation(err, "players_group_user_uq")) {
      return { ok: false, reason: "already-member" };
    }
    throw err;
  }

  if (updatedRows.length === 0) {
    return { ok: false, reason: "already-resolved" };
  }

  await sql`
    UPDATE claims SET claim_status = 'approved', approved_by = ${adminUserId}, decided_at = now()
    WHERE id = ${claimId}
  `;

  const infoRows = (await sql`
    SELECT p.display_name AS player_name, u.email AS user_email
    FROM players p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${claim.player_id}
  `) as { player_name: string; user_email: string | null }[];
  const info = infoRows[0];

  return { ok: true, playerName: info?.player_name ?? "", userEmail: info?.user_email ?? null };
}

/** Rejects a pending claim without touching the player. */
export async function rejectClaim(claimId: string, adminUserId: string): Promise<void> {
  await sql`
    UPDATE claims SET claim_status = 'rejected', approved_by = ${adminUserId}, decided_at = now()
    WHERE id = ${claimId} AND claim_status = 'pending'
  `;
}

/** Archives a legacy player, removing it from the claimable pool. */
export async function archivePlayer(playerId: string, _adminUserId: string): Promise<void> {
  await sql`UPDATE players SET archived = true WHERE id = ${playerId}`;
}

/**
 * Creates a brand-new player already linked to a user (no legacy history to claim).
 *
 * Display names must be unique per group case-insensitively. A pre-check
 * catches the common case with a clean, 409-able result; the INSERT is still
 * wrapped to catch the `players_group_lower_name_uq` unique-index violation
 * as a race backstop (same pattern as `createPendingClaim`/`approveClaim`),
 * so a concurrent request can never surface as a raw 500.
 */
export async function createFreshPlayer(
  userId: string,
  groupId: string,
  displayName: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: "name-taken" }> {
  const existingRows = (await sql`
    SELECT id FROM players WHERE group_id = ${groupId} AND lower(display_name) = lower(${displayName})
  `) as { id: string }[];
  if (existingRows.length > 0) {
    return { ok: false, reason: "name-taken" };
  }

  const id = newId("plyr");
  try {
    await sql`
      INSERT INTO players (id, group_id, display_name, user_id)
      VALUES (${id}, ${groupId}, ${displayName}, ${userId})
    `;
  } catch (err) {
    if (isUniqueViolation(err, "players_group_lower_name_uq")) {
      return { ok: false, reason: "name-taken" };
    }
    throw err;
  }

  return { ok: true, id };
}

/** True iff the group still has unclaimed, unarchived legacy players to migrate. */
export async function migrationActive(groupId: string): Promise<boolean> {
  const players = await unclaimedLegacyPlayers(groupId);
  return players.length > 0;
}
