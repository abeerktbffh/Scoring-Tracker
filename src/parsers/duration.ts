const MIN_SEC = /(\d+)\s*minutes?\s*(?:and\s*)?(\d+)\s*seconds?/i;
const MIN_ONLY = /(\d+)\s*minutes?/i;
const SEC_ONLY = /(\d+)\s*seconds?/i;

/**
 * Total seconds from a share sentence like "…in X minutes and Y seconds".
 * Handles minutes+seconds, minutes-only (with optional trailing seconds),
 * and seconds-only. Returns null when no time is present. PURE.
 */
export function parseDurationSeconds(text: string): number | null {
  const both = text.match(MIN_SEC);
  if (both) return Number(both[1]) * 60 + Number(both[2]);
  const mins = text.match(MIN_ONLY);
  const secs = text.match(SEC_ONLY);
  if (mins) return Number(mins[1]) * 60 + (secs ? Number(secs[1]) : 0);
  if (secs) return Number(secs[1]);
  return null;
}
