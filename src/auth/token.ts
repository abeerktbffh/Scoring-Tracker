import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

function key(): Uint8Array {
  return new TextEncoder().encode(getEnv("AUTH_SECRET"));
}

export async function issueGroupToken(groupId: string): Promise<string> {
  return new SignJWT({ groupId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
}

export async function verifyGroupToken(
  token: string,
): Promise<{ groupId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.groupId !== "string") return null;
    return { groupId: payload.groupId };
  } catch {
    return null;
  }
}
