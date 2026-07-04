import type {
  Adapter,
  AdapterAccount,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";
import { sql } from "@/db/client";
import { newId } from "@/lib/ids";

// === Pure row -> Auth.js object mappers (exported for testing) ===

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  email_verified: string | Date | null;
  image: string | null;
}

export function rowToUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified === null ? null : new Date(row.email_verified),
    image: row.image,
  };
}

interface AccountRow {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | string | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
}

export function rowToAccount(row: AccountRow): AdapterAccount {
  return {
    userId: row.user_id,
    type: row.type as AdapterAccount["type"],
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    refresh_token: row.refresh_token,
    access_token: row.access_token,
    expires_at: row.expires_at === null ? null : Number(row.expires_at),
    token_type: row.token_type,
    scope: row.scope,
    id_token: row.id_token,
    session_state: row.session_state,
  } as AdapterAccount;
}

// === Adapter ===

export function NeonAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const id = newId("u");
      const rows = (await sql`
        INSERT INTO users (id, name, email, email_verified, image)
        VALUES (${id}, ${user.name ?? null}, ${user.email}, ${user.emailVerified ?? null}, ${user.image ?? null})
        RETURNING id, name, email, email_verified, image
      `) as unknown as UserRow[];
      return rowToUser(rows[0]);
    },

    async getUser(id: string) {
      const rows = (await sql`
        SELECT id, name, email, email_verified, image
        FROM users
        WHERE id = ${id}
      `) as unknown as UserRow[];
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByEmail(email: string) {
      const rows = (await sql`
        SELECT id, name, email, email_verified, image
        FROM users
        WHERE email = ${email}
      `) as unknown as UserRow[];
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const rows = (await sql`
        SELECT u.id, u.name, u.email, u.email_verified, u.image
        FROM users u
        JOIN accounts a ON a.user_id = u.id
        WHERE a.provider = ${provider} AND a.provider_account_id = ${providerAccountId}
      `) as unknown as UserRow[];
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      const existingRows = (await sql`
        SELECT id, name, email, email_verified, image
        FROM users
        WHERE id = ${user.id}
      `) as unknown as UserRow[];
      const existing = existingRows[0];
      if (!existing) throw new Error(`updateUser: no user with id ${user.id}`);

      const merged = {
        name: user.name !== undefined ? user.name : existing.name,
        email: user.email !== undefined ? user.email : existing.email,
        email_verified:
          user.emailVerified !== undefined ? user.emailVerified : existing.email_verified,
        image: user.image !== undefined ? user.image : existing.image,
      };

      const rows = (await sql`
        UPDATE users
        SET name = ${merged.name}, email = ${merged.email},
            email_verified = ${merged.email_verified}, image = ${merged.image}
        WHERE id = ${user.id}
        RETURNING id, name, email, email_verified, image
      `) as unknown as UserRow[];
      return rowToUser(rows[0]);
    },

    async linkAccount(account: AdapterAccount) {
      const id = newId("acc");
      await sql`
        INSERT INTO accounts (
          id, user_id, type, provider, provider_account_id,
          refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
        )
        VALUES (
          ${id}, ${account.userId}, ${account.type}, ${account.provider}, ${account.providerAccountId},
          ${account.refresh_token ?? null}, ${account.access_token ?? null}, ${account.expires_at ?? null},
          ${account.token_type ?? null}, ${account.scope ?? null}, ${account.id_token ?? null},
          ${account.session_state ?? null}
        )
      `;
    },

    async createVerificationToken(verificationToken: VerificationToken) {
      await sql`
        INSERT INTO verification_token (identifier, token, expires)
        VALUES (${verificationToken.identifier}, ${verificationToken.token}, ${verificationToken.expires})
      `;
      return verificationToken;
    },

    async useVerificationToken({
      identifier,
      token,
    }: {
      identifier: string;
      token: string;
    }) {
      const rows = (await sql`
        DELETE FROM verification_token
        WHERE identifier = ${identifier} AND token = ${token}
        RETURNING identifier, token, expires
      `) as unknown as { identifier: string; token: string; expires: string | Date }[];
      const row = rows[0];
      if (!row) return null;
      return {
        identifier: row.identifier,
        token: row.token,
        expires: new Date(row.expires),
      };
    },
  };
}
