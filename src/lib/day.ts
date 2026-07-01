export function localDateInTz(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; timeZone shifts the instant to the group's local day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}
