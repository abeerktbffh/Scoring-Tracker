import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderAdminJoinNotification,
  sendVerificationEmail,
} from "./email";
import { rateLimit } from "./rateLimit";

describe("email render functions", () => {
  it("renderVerificationEmail includes the link in the body", () => {
    const link = "https://x/verify?t=1";
    const { subject, html, text } = renderVerificationEmail(link);
    expect(subject).toBeTruthy();
    expect(html).toContain(link);
    expect(text).toContain(link);
  });

  it("renderPasswordResetEmail includes the link in the body", () => {
    const link = "https://x/reset?t=1";
    const { subject, html, text } = renderPasswordResetEmail(link);
    expect(subject).toBeTruthy();
    expect(html).toContain(link);
    expect(text).toContain(link);
  });

  it("renderAdminJoinNotification includes player name and email in the body", () => {
    const { subject, html, text } = renderAdminJoinNotification("Alice", "alice@example.com");
    expect(subject).toBeTruthy();
    expect(html).toContain("Alice");
    expect(html).toContain("alice@example.com");
    expect(text).toContain("Alice");
    expect(text).toContain("alice@example.com");
  });
});

describe("sendVerificationEmail without RESEND_API_KEY", () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
  });

  it("returns {sent:false} as a no-op when RESEND_API_KEY is unset", async () => {
    const result = await sendVerificationEmail("someone@example.com", "https://x/verify?t=1");
    expect(result).toEqual({ sent: false });
  });
});

describe("rateLimit", () => {
  it("allows the first N calls then blocks the N+1 within the window", () => {
    const key = `test-key-${Date.now()}-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
  });
});
