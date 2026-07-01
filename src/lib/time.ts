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
