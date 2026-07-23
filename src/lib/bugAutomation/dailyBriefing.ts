export interface BriefingCandidate {
  id: string;
  priority: string;
  title: string;
}

/** The in-session daily briefing text. PURE. */
export function formatDailyBriefing(candidates: BriefingCandidate[], today: string): string {
  if (candidates.length === 0) {
    return `🐛 Daily bug check (${today}): no new build candidates.`;
  }
  const list = candidates.map((c) => `${c.id} [${c.priority}] ${c.title}`).join("; ");
  const top = candidates[0].id;
  return `🐛 Daily bug check (${today}): ${candidates.length} ready to build — ${list}. Say "build ${top}" and I'll build it (supervised, draft PR).`;
}

/** One Run Log append row summarising the daily notify. PURE. */
export function formatRunLogCandidates(today: string, candidates: { id: string }[]): string[][] {
  const ids = candidates.length ? candidates.map((c) => c.id).join(",") : "-";
  return [[today, "notify", `candidates:${candidates.length}`, ids, ""]];
}
