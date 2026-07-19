/** Lowercase, non-alphanumerics → single hyphens, trimmed, ≤40 chars. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

/** Per-bug branch name: auto/bug-<lowerid>-<slug> (id-only if no slug). */
export function buildBranchName(item: { id: string; title: string }): string {
  const slug = slugify(item.title);
  const id = item.id.toLowerCase();
  return slug ? `auto/bug-${id}-${slug}` : `auto/bug-${id}`;
}
