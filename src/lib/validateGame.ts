export interface ValidGame {
  id: string;
  name: string;
  type: "outcome" | "timed";
  metricDirection: "lower_better" | "higher_better";
  hasVariants: boolean;
  parserId: string | null;
}

export function validateNewGame(input: unknown): ValidGame | { error: string } {
  const b = (input ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";

  if (!/^[a-z0-9-]+$/.test(id)) {
    return { error: "Invalid game id (use lowercase letters, digits, hyphens)" };
  }
  if (name.length === 0) return { error: "Name is required" };
  if (b.type !== "outcome" && b.type !== "timed") return { error: "Invalid type" };
  if (b.metricDirection !== "lower_better" && b.metricDirection !== "higher_better") {
    return { error: "Invalid metricDirection" };
  }

  const parserId =
    typeof b.parserId === "string" && b.parserId.trim().length > 0 ? b.parserId.trim() : null;

  return {
    id,
    name,
    type: b.type,
    metricDirection: b.metricDirection,
    hasVariants: b.hasVariants === true,
    parserId,
  };
}
