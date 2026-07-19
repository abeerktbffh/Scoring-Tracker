import type { CellWrite } from "./statusWrite";

/** One append row summarising a run, for the sheet's Run Log tab. */
export function formatRunLogRow(
  today: string,
  s: { candidates: number; built: number; questions: number; blocked: number },
): string[][] {
  return [[today, `candidates:${s.candidates}`, `built:${s.built}`, `questions:${s.questions}`, `blocked:${s.blocked}`]];
}

/**
 * The single choke point for applying Status/Notes writes. When `dryRun`,
 * logs each intended write and calls `update` zero times. Otherwise applies
 * each write as a single-cell update. Keeping ALL writes behind this makes
 * the dry-run guarantee auditable in one place.
 */
export async function applyWrites(
  writes: CellWrite[],
  opts: { dryRun: boolean; update: (range: string, values: string[][]) => Promise<void>; log?: (m: string) => void },
): Promise<void> {
  const log = opts.log ?? console.log;
  for (const w of writes) {
    if (opts.dryRun) {
      log(`[dry-run] would set ${w.range} = ${JSON.stringify(w.value)}`);
      continue;
    }
    await opts.update(w.range, [[w.value]]);
  }
}
