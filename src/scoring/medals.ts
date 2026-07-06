import { isBetter, type GameEntry } from "./wins";

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
