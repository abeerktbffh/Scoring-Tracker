"use client";
import React, { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import styles from "./SignInGate.module.css";

export interface SignInGateProps {
  onAuthed?: () => void;
}

type Mode = "signin" | "register" | "reset";

const CREDENTIALS_ERROR_COPY = "Wrong email or password, or your email isn't verified yet.";
const RESET_CONFIRMATION_COPY = "If that email exists, we sent a link to reset your password.";

async function isGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/providers");
    if (!res.ok) return true; // can't determine — show it, it errors clearly if unconfigured
    const providers = (await res.json()) as Record<string, unknown>;
    return "google" in providers;
  } catch {
    return true; // can't determine — same fallback as above
  }
}

export function SignInGate({ onAuthed }: SignInGateProps): JSX.Element {
  const [mode, setMode] = useState<Mode>("signin");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isGoogleEnabled().then((enabled) => {
      if (!cancelled) setGoogleEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setRegistered(false);
    setResetRequested(false);
  }

  async function handleGoogle() {
    await signIn("google");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    if (result?.ok) {
      onAuthed?.();
    } else {
      setError(CREDENTIALS_ERROR_COPY);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        setRegistered(true);
      } else if (res.status === 409) {
        setError("This email is already registered — sign in instead.");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body?.error === "string" ? body.error : "Something went wrong. Please try again."
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Enumeration-safe UX: always show the same neutral confirmation,
      // regardless of whether the request succeeded, failed, or the email exists.
      setSubmitting(false);
      setResetRequested(true);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.kicker}>Bragboard</p>
        <h1 className={styles.headline}>The daily standings, kept honest.</h1>

        {mode === "signin" && (
          <>
            <p className={styles.sub}>Sign in to see today&rsquo;s board.</p>

            {googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.google}
                  onClick={handleGoogle}
                >
                  Continue with Google
                </Button>
                <div className={styles.divider}>
                  <span>or</span>
                </div>
              </>
            )}

            <form onSubmit={handleSignIn}>
              <label className={styles.label} htmlFor="signin-email">
                Email
              </label>
              <input
                id="signin-email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className={styles.label} htmlFor="signin-password">
                Password
              </label>
              <input
                id="signin-password"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error && <p className={styles.error}>{error}</p>}

              <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className={styles.links}>
              <button type="button" className={styles.linkButton} onClick={() => switchMode("reset")}>
                Forgot password?
              </button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => switchMode("register")}
              >
                Create account
              </button>
            </div>
          </>
        )}

        {mode === "register" && !registered && (
          <>
            <p className={styles.sub}>Create an account to join the board.</p>

            <form onSubmit={handleRegister}>
              <label className={styles.label} htmlFor="register-email">
                Email
              </label>
              <input
                id="register-email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className={styles.label} htmlFor="register-password">
                Password
              </label>
              <input
                id="register-password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error && <p className={styles.error}>{error}</p>}

              <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <div className={styles.links}>
              <button type="button" className={styles.linkButton} onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === "register" && registered && (
          <p className={styles.confirmation}>
            Check your email to verify your account, then sign in.
          </p>
        )}

        {mode === "reset" && !resetRequested && (
          <>
            <p className={styles.sub}>Enter your email and we&rsquo;ll send a reset link.</p>

            <form onSubmit={handleReset}>
              <label className={styles.label} htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <div className={styles.links}>
              <button type="button" className={styles.linkButton} onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === "reset" && resetRequested && (
          <p className={styles.confirmation}>{RESET_CONFIRMATION_COPY}</p>
        )}
      </div>
    </div>
  );
}
