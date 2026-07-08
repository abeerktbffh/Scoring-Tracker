export type Platform = "ios" | "android" | "other";

/** Best-effort UA-based platform detection for choosing setup instructions. */
export function detectPlatform(ua?: string): Platform {
  const s = (ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "other";
}
