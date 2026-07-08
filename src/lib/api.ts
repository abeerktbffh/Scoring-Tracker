// Typed client API layer for the Bragboard front end.
// Wraps fetch calls to the existing backend routes and normalizes results into
// a discriminated union so callers never need to touch raw Response objects.

import type { ResultDetail } from "@/parsers/types";
export type { ResultDetail } from "@/parsers/types";

export interface Game {
  id: string;
  name: string;
  type: "outcome" | "timed";
  metricDirection: "lower_better" | "higher_better";
  hasVariants: boolean;
}

export type Medal = "gold" | "silver" | "bronze";

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface OverallRow extends MedalCounts {
  displayName: string;
  gamesPlayed: number;
  gamesLed: string[];
}

export interface MedalBoardRow extends MedalCounts {
  displayName: string;
  gamesPlayed: number;
}

export interface DailyContestRow {
  displayName: string;
  value: number;
  valueFormatted: string;
  solved: boolean;
  medal: Medal | null;
  detail: ResultDetail | null;
  variant: string | null;
}

export interface Player {
  id: string;
  displayName: string;
}

export interface MeResponse {
  today: {
    date: string;
    loggedCount: number;
    totalCount: number;
    games: { gameId: string; name: string; logged: boolean }[];
  };
  streaks: { gameId: string; name: string; currentStreak: number; longestStreak: number }[];
  recent: {
    gameId: string;
    name: string;
    variant: string | null;
    value: number;
    solved: boolean;
    puzzleDate: string;
    detail: ResultDetail | null;
  }[];
  displayName: string | null;
}

export interface NewGameInput {
  id: string;
  name: string;
  type: "outcome" | "timed";
  metricDirection: "lower_better" | "higher_better";
  hasVariants: boolean;
  parserId: string | null;
}

export interface EntryInput {
  rawInput?: string;
  gameId?: string;
  variant?: string;
  value?: number;
  solved?: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/**
 * Maps an HTTP status + parsed JSON body to a user-friendly error string.
 * Prefers `body.error` when present; otherwise falls back to per-status copy.
 */
export function normalizeError(status: number, body: unknown): string {
  const bodyError =
    body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : undefined;

  if (bodyError) return bodyError;

  switch (status) {
    case 401:
      return "Please sign in again.";
    case 403:
      return "You don't have access to this.";
    case 422:
      return "Couldn't read that — check the format.";
    default:
      return "Something went wrong — try again.";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, error: normalizeError(0, undefined), status: 0 };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    return { ok: false, error: normalizeError(res.status, body), status: res.status };
  }

  return { ok: true, data: body as T };
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function getGames(group?: string): Promise<ApiResult<{ games: Game[] }>> {
  const params = new URLSearchParams();
  if (group !== undefined) params.set("group", group);
  const qs = params.toString();
  return request(`/api/games${qs ? `?${qs}` : ""}`);
}

export function getLeaderboard(
  window?: string,
  player?: string,
  group?: string
): Promise<ApiResult<{ window: string; locked: boolean; players: OverallRow[]; viewerName: string | null }>> {
  const params = new URLSearchParams();
  if (window !== undefined) params.set("window", window);
  if (player !== undefined) params.set("player", player);
  if (group !== undefined) params.set("group", group);
  const qs = params.toString();
  return request(`/api/leaderboard${qs ? `?${qs}` : ""}`);
}

export function getBoard(
  gameId: string,
  window?: string,
  player?: string,
  group?: string
): Promise<
  ApiResult<{
    gameId: string;
    window: string;
    mode: "daily" | "aggregate";
    locked: boolean;
    players: DailyContestRow[] | MedalBoardRow[];
    viewerName: string | null;
  }>
> {
  const params = new URLSearchParams();
  if (window !== undefined) params.set("window", window);
  if (player !== undefined) params.set("player", player);
  if (group !== undefined) params.set("group", group);
  const qs = params.toString();
  return request(`/api/games/${encodeURIComponent(gameId)}/board${qs ? `?${qs}` : ""}`);
}

export function getPlayers(): Promise<ApiResult<{ players: Player[] }>> {
  return request("/api/players");
}

export function getMe(player: string, group?: string): Promise<ApiResult<MeResponse>> {
  const params = new URLSearchParams();
  params.set("player", player);
  if (group !== undefined) params.set("group", group);
  return request(`/api/me?${params.toString()}`);
}

export function postEntry(
  body: EntryInput
): Promise<
  ApiResult<{
    ok: true;
    parsed: { gameId: string; value: number; solved: boolean; detail: ResultDetail | null };
  }>
> {
  return request("/api/entries", jsonPost(body));
}

export function postAdminGame(game: NewGameInput): Promise<ApiResult<{ game: Game }>> {
  return request("/api/admin/games", jsonPost(game));
}

export function renameSelf(
  newName: string
): Promise<ApiResult<{ ok: true; displayName: string }>> {
  return request("/api/me/rename", jsonPost({ newName }));
}

export function createGroup(
  name: string,
  gameIds: string[]
): Promise<ApiResult<{ id: string; link: string }>> {
  return request("/api/groups", jsonPost({ name, gameIds }));
}

export function listMyGroups(): Promise<
  ApiResult<{ groups: { id: string; name: string; role: "admin" | "member" }[] }>
> {
  return request("/api/groups");
}

export function joinGroup(token: string): Promise<ApiResult<{ ok: true; groupId: string }>> {
  return request("/api/groups/join", jsonPost({ token }));
}

export function getGroupPreview(
  token: string
): Promise<ApiResult<{ group: { id: string; name: string; memberCount: number; gameCount: number } }>> {
  return request(`/api/groups/preview?token=${encodeURIComponent(token)}`);
}

export function renameGroup(groupId: string, name: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteGroup(groupId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
}

export function setGroupGames(
  groupId: string,
  gameIds: string[]
): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/games`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameIds }),
  });
}

export function removeMember(groupId: string, userId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export function leaveGroup(groupId: string): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/leave`, jsonPost({}));
}

export function resetGroupInvite(groupId: string): Promise<ApiResult<{ link: string }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/invite`, jsonPost({}));
}

export function getGroupInvite(groupId: string): Promise<ApiResult<{ link: string }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/invite`);
}

export function getGroupMembers(
  groupId: string
): Promise<ApiResult<{ members: { userId: string; displayName: string | null; role: "admin" | "member" }[] }>> {
  return request(`/api/groups/${encodeURIComponent(groupId)}/members`);
}
