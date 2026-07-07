import { isBetter, type GameEntry } from "./wins";
import { type DatedGameEntry } from "./gameBoard";

export type Medal = "gold" | "silver" | "bronze";

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface MedalTally extends MedalCounts {
  playerId: string;
}

// Re-exported for test ergonomics; tallyMedals consumes the same GameEntry
// shape the rest of the scoring layer uses.
export type GameEntryLike = GameEntry;

function groupKey(e: GameEntry): string {
  return `${e.gameId}|${e.variant ?? ""}|${e.puzzleKey}`;
}

const MEDAL_BY_RANK: (Medal | null)[] = ["gold", "silver", "bronze"];

/**
 * Placements per player, summed across every game+variant+puzzle group.
 * Among SOLVED entries in a group, distinct values are ranked by direction:
 * best distinct = gold (all co-winners tie for gold), 2nd distinct = silver,
 * 3rd distinct = bronze. Nothing past 3rd. PURE.
 */
export function tallyMedals(entries: GameEntry[]): MedalTally[] {
  const tally = new Map<string, MedalTally>();
  const ensure = (playerId: string): MedalTally => {
    let t = tally.get(playerId);
    if (!t) {
      t = { playerId, gold: 0, silver: 0, bronze: 0 };
      tally.set(playerId, t);
    }
    return t;
  };
  for (const e of entries) ensure(e.playerId);

  const groups = new Map<string, GameEntry[]>();
  for (const e of entries) {
    const key = groupKey(e);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(e);
  }

  for (const group of groups.values()) {
    const solved = group.filter((e) => e.solved);
    if (solved.length === 0) continue;
    const dir = solved[0].direction;
    const distinct = [...new Set(solved.map((e) => e.value))].sort((a, b) =>
      isBetter(a, b, dir) ? -1 : isBetter(b, a, dir) ? 1 : 0,
    );
    for (const e of solved) {
      const rank = distinct.indexOf(e.value);
      const medal = MEDAL_BY_RANK[rank];
      if (medal) ensure(e.playerId)[medal] += 1;
    }
  }

  return [...tally.values()].sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}

export interface MedalBoardStat extends MedalCounts {
  playerId: string;
  gamesPlayed: number;
  pb: number | null;
}

/**
 * Aggregate per-game board over a window: medals (window), gamesPlayed
 * (window), PB (best solved value ALL-TIME by direction). PURE.
 */
export function computeMedalBoard(entries: DatedGameEntry[], start: string | null): MedalBoardStat[] {
  const inWindow = (d: string) => start === null || d >= start;
  const windowed = entries.filter((e) => inWindow(e.puzzleDate));
  const medals = new Map(tallyMedals(windowed).map((m) => [m.playerId, m]));

  const byPlayer = new Map<string, DatedGameEntry[]>();
  for (const e of entries) {
    let g = byPlayer.get(e.playerId);
    if (!g) {
      g = [];
      byPlayer.set(e.playerId, g);
    }
    g.push(e);
  }

  const rows: MedalBoardStat[] = [];
  for (const [playerId, all] of byPlayer.entries()) {
    const win = all.filter((e) => inWindow(e.puzzleDate));
    if (win.length === 0) continue;
    let pb: number | null = null;
    for (const e of all) {
      if (!e.solved) continue;
      if (pb === null || isBetter(e.value, pb, e.direction)) pb = e.value;
    }
    const m = medals.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    rows.push({ playerId, gold: m.gold, silver: m.silver, bronze: m.bronze, gamesPlayed: win.length, pb });
  }

  return rows.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}

export interface DailyContestStat {
  playerId: string;
  value: number;
  solved: boolean;
  medal: Medal | null;
  variant: string | null;
}

// Pips' difficulties rank in this fixed order within the Today board; any
// other (future) variant sorts alphabetically after them. null (non-variant
// games) always sorts first.
const PIPS_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

function compareVariant(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const ra = PIPS_ORDER[a];
  const rb = PIPS_ORDER[b];
  if (ra !== undefined && rb !== undefined) return ra - rb;
  if (ra !== undefined) return -1;
  if (rb !== undefined) return 1;
  return a.localeCompare(b);
}

/**
 * Today's live contest for a single (game, variant) group. Solved entries
 * ranked by direction; unsolved sink to the bottom (by playerId). Medal by
 * distinct-value rank among solved (gold/silver/bronze; co-winners tie for
 * gold). PURE.
 */
function computeGroupContest(entries: GameEntry[], variant: string | null): DailyContestStat[] {
  const solved = entries.filter((e) => e.solved);
  const unsolved = entries.filter((e) => !e.solved);
  const dir = entries[0]?.direction ?? "lower_better";
  const distinct = [...new Set(solved.map((e) => e.value))].sort((a, b) =>
    isBetter(a, b, dir) ? -1 : isBetter(b, a, dir) ? 1 : 0,
  );

  const solvedRows: DailyContestStat[] = solved
    .slice()
    .sort((a, b) => (isBetter(a.value, b.value, dir) ? -1 : isBetter(b.value, a.value, dir) ? 1 : a.playerId.localeCompare(b.playerId)))
    .map((e) => ({
      playerId: e.playerId,
      value: e.value,
      solved: true,
      medal: MEDAL_BY_RANK[distinct.indexOf(e.value)] ?? null,
      variant,
    }));

  const unsolvedRows: DailyContestStat[] = unsolved
    .slice()
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map((e) => ({ playerId: e.playerId, value: e.value, solved: false, medal: null, variant }));

  return [...solvedRows, ...unsolvedRows];
}

/**
 * Today's live contest for a game. Entries are split into per-variant
 * sub-contests (null/absent variant = the whole game is one group, which is
 * every game except Pips) so difficulties never rank against each other;
 * each group gets its own placement/medals via the same dense-ranking rule.
 * Groups are ordered null first, then Pips difficulties (easy/medium/hard),
 * then any other variant alphabetically. PURE.
 */
export function computeDailyContest(entries: GameEntry[]): DailyContestStat[] {
  const groups = new Map<string | null, GameEntry[]>();
  for (const e of entries) {
    const variant = e.variant ?? null;
    let g = groups.get(variant);
    if (!g) {
      g = [];
      groups.set(variant, g);
    }
    g.push(e);
  }

  const orderedVariants = [...groups.keys()].sort(compareVariant);
  return orderedVariants.flatMap((variant) => computeGroupContest(groups.get(variant)!, variant));
}

export interface OverallMedalStat extends MedalCounts {
  playerId: string;
  gamesPlayed: number;
  gamesLed: string[];
}

/**
 * Overall medal tally across ALL games. gamesLed = the games where this player
 * has the most golds (>0). PURE.
 */
export function computeOverallMedals(entries: GameEntry[]): OverallMedalStat[] {
  const totals = new Map(tallyMedals(entries).map((m) => [m.playerId, m]));

  const played = new Map<string, number>();
  for (const e of entries) played.set(e.playerId, (played.get(e.playerId) ?? 0) + 1);

  // Gold leaders per game.
  const byGame = new Map<string, GameEntry[]>();
  for (const e of entries) {
    let g = byGame.get(e.gameId);
    if (!g) {
      g = [];
      byGame.set(e.gameId, g);
    }
    g.push(e);
  }
  const gamesLed = new Map<string, string[]>();
  for (const [gameId, gameEntries] of byGame.entries()) {
    const golds = tallyMedals(gameEntries);
    const maxGold = golds.reduce((mx, m) => Math.max(mx, m.gold), 0);
    if (maxGold === 0) continue;
    for (const m of golds) {
      if (m.gold === maxGold) {
        const list = gamesLed.get(m.playerId) ?? [];
        list.push(gameId);
        gamesLed.set(m.playerId, list);
      }
    }
  }

  const rows: OverallMedalStat[] = [...played.entries()].map(([playerId, gamesPlayed]) => {
    const m = totals.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    return {
      playerId,
      gold: m.gold,
      silver: m.silver,
      bronze: m.bronze,
      gamesPlayed,
      gamesLed: (gamesLed.get(playerId) ?? []).sort(),
    };
  });

  return rows.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerId.localeCompare(b.playerId),
  );
}
