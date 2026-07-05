interface NeonDbErrorLike { code?: string; constraint?: string }
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as NeonDbErrorLike | undefined;
  return !!e && e.code === "23505" && e.constraint === constraint;
}
