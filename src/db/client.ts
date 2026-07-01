import { neon } from "@neondatabase/serverless";
import { getEnv } from "@/lib/env";

// Neon's HTTP driver is connection-pooled by design — safe for serverless.
// The client is created lazily on first query so importing this module has no
// side effects: `next build` (which imports route modules to collect page data)
// never needs DATABASE_URL, and the var is only required at request time.
let client: ReturnType<typeof neon> | null = null;
function getClient(): ReturnType<typeof neon> {
  if (!client) client = neon(getEnv("DATABASE_URL"));
  return client;
}

// Preserves both call styles used across the app: the tagged-template
// `sql`...`` and the direct `sql("...")` form both forward to the real client.
export const sql = ((strings: TemplateStringsArray | string, ...values: unknown[]) =>
  (getClient() as (...a: unknown[]) => unknown)(strings, ...values)) as ReturnType<typeof neon>;
