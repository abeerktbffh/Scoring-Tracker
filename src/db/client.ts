import { neon } from "@neondatabase/serverless";
import { getEnv } from "@/lib/env";

// Neon's HTTP driver is connection-pooled by design — safe for serverless.
export const sql = neon(getEnv("DATABASE_URL"));
