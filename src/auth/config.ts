import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { NeonAdapter } from "./adapter";
import { verifyPassword } from "./password";
import { sql } from "@/db/client";

const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: NeonAdapter(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },  // 30-day TTL
  trustHost: true,
  providers: [
    ...(googleEnabled ? [Google({
      allowDangerousEmailAccountLinking: false,
      // Google emails are provider-verified → mark the created user verified.
      profile: (p) => ({ id: p.sub, name: p.name, email: p.email, image: p.picture,
        emailVerified: p.email_verified ? new Date() : null } as any),
    })] : []),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const email = String(c?.email ?? "").toLowerCase();
        const password = String(c?.password ?? "");
        if (!email || !password) return null;
        const rows = (await sql`SELECT id, email, email_verified, password_hash FROM users WHERE email = ${email}`) as any[];
        const u = rows[0];
        if (!u || !u.password_hash) return null;
        if (!u.email_verified) return null;                 // must verify first
        if (!(await verifyPassword(password, u.password_hash))) return null;
        return { id: u.id, email: u.email };
      },
    }),
  ],
  callbacks: {
    // One method per email: a Google sign-in must NOT take over an email that already
    // signs in with a password. (No linking — reject instead, with a clear message.)
    signIn: async ({ user, account }) => {
      if (account?.provider === "google") {
        const email = (user.email ?? "").toLowerCase();
        if (!email) return false;
        const rows = (await sql`SELECT id, password_hash FROM users WHERE email = ${email}`) as any[];
        const existing = rows[0];
        // Reject if a DISTINCT credentials account owns this email. (Auth.js has already
        // resolved/created the Google user via the adapter; if a separate password user exists
        // with the same email, refuse to proceed.)
        if (existing && existing.password_hash && existing.id !== (user as any).id) {
          return "/signin?error=email_uses_password"; // redirect to sign-in with a clear message
        }
      }
      return true;
    },
    jwt: async ({ token, user }) => { if (user?.id) token.userId = user.id; return token; },
    session: async ({ session, token }) => {
      session.user = { id: (token as any).userId } as any;   // ONLY id — no role/membership in the token
      return session;
    },
  },
});
