import { describe, expect, it } from "vitest";
import { rowToAccount, rowToUser } from "@/auth/adapter";

describe("rowToUser", () => {
  it("maps a verified user row: snake_case -> camelCase, email_verified timestamp -> Date", () => {
    const row = {
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      email_verified: "2026-01-15T10:30:00.000Z",
      image: "https://example.com/ada.png",
    };

    const user = rowToUser(row);

    expect(user).toEqual({
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      emailVerified: new Date("2026-01-15T10:30:00.000Z"),
      image: "https://example.com/ada.png",
    });
    expect(user.emailVerified).toBeInstanceOf(Date);
  });

  it("maps a null email_verified to null (unverified credentials user)", () => {
    const row = {
      id: "u_2",
      name: null,
      email: "bob@example.com",
      email_verified: null,
      image: null,
    };

    const user = rowToUser(row);

    expect(user.emailVerified).toBeNull();
    expect(user.name).toBeNull();
    expect(user.image).toBeNull();
  });

  it("passes through id/email untouched and does not leak snake_case keys", () => {
    const row = {
      id: "u_3",
      name: "Grace Hopper",
      email: "grace@example.com",
      email_verified: null,
      image: null,
    };

    const user = rowToUser(row);

    expect(user.id).toBe("u_3");
    expect(user.email).toBe("grace@example.com");
    expect(user).not.toHaveProperty("email_verified");
  });
});

describe("rowToAccount", () => {
  it("maps snake_case OAuth account columns to Auth.js AdapterAccount shape", () => {
    const row = {
      id: "a_1",
      user_id: "u_1",
      type: "oauth",
      provider: "google",
      provider_account_id: "1234567890",
      refresh_token: "refresh-abc",
      access_token: "access-xyz",
      expires_at: 1893456000,
      token_type: "bearer",
      scope: "openid email profile",
      id_token: "id-token-value",
      session_state: "state-value",
    };

    const account = rowToAccount(row);

    expect(account).toEqual({
      userId: "u_1",
      type: "oauth",
      provider: "google",
      providerAccountId: "1234567890",
      refresh_token: "refresh-abc",
      access_token: "access-xyz",
      expires_at: 1893456000,
      token_type: "bearer",
      scope: "openid email profile",
      id_token: "id-token-value",
      session_state: "state-value",
    });
  });

  it("keeps expires_at as a number, not a string", () => {
    const row = {
      id: "a_2",
      user_id: "u_2",
      type: "oauth",
      provider: "google",
      provider_account_id: "999",
      refresh_token: null,
      access_token: "access-2",
      expires_at: "1893456000",
      token_type: "bearer",
      scope: "openid",
      id_token: "id-2",
      session_state: null,
    };

    const account = rowToAccount(row);

    expect(account.expires_at).toBe(1893456000);
    expect(typeof account.expires_at).toBe("number");
  });

  it("handles null optional OAuth fields", () => {
    const row = {
      id: "a_3",
      user_id: "u_3",
      type: "oauth",
      provider: "google",
      provider_account_id: "555",
      refresh_token: null,
      access_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      id_token: null,
      session_state: null,
    };

    const account = rowToAccount(row);

    expect(account.refresh_token).toBeNull();
    expect(account.expires_at).toBeNull();
    expect(account).not.toHaveProperty("providerAccountId".toLowerCase() + "_never");
  });
});
