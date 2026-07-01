import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { verifySecret } from "@/auth/hash";
import { issueGroupToken } from "@/auth/token";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { passphrase } = await req.json().catch(() => ({}));
  if (typeof passphrase !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const rows = (await sql`SELECT id, passphrase_hash FROM groups WHERE id = 'g1'`) as {
    id: string;
    passphrase_hash: string;
  }[];
  const group = rows[0];
  if (!group || !(await verifySecret(passphrase, group.passphrase_hash))) {
    return NextResponse.json({ error: "Wrong passphrase" }, { status: 401 });
  }
  const token = await issueGroupToken(group.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("group_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
