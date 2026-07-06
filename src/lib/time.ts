// Parse "m:ss", "h:mm:ss", or plain seconds into a total number of seconds.
// Returns null for anything malformed.
export function parseClock(input: string): number | null {
  const s = input.trim();
  if (s.length === 0) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

// Inverse of parseClock for display: total seconds -> "m:ss" (zero-padded
// seconds). 593 -> "9:53", 31 -> "0:31". Floors fractional seconds and
// clamps negatives to "0:00". mm:ss only (no hours) — matches the games.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
