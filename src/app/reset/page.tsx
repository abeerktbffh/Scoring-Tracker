"use client";
import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import buttonStyles from "@/components/Button.module.css";
import styles from "./page.module.css";

const GENERIC_INVALID = "This reset link is invalid or has expired.";
const PASSWORDS_DONT_MATCH = "Passwords don't match.";

type State = "form" | "submitting" | "success" | "error";

function ResetPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<State>("form");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(PASSWORDS_DONT_MATCH);
      return;
    }

    if (!token) {
      setState("error");
      return;
    }

    setState("submitting");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.kicker}>Bragboard</p>
        <h1 className={styles.headline}>Reset your password</h1>

        {(state === "form" || state === "submitting") && (
          <>
            <p className={styles.sub}>Choose a new password for your account.</p>

            <form onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="reset-password">
                New password
              </label>
              <input
                id="reset-password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <label className={styles.label} htmlFor="reset-confirm-password">
                Confirm password
              </label>
              <input
                id="reset-confirm-password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              {error && <p className={styles.error}>{error}</p>}

              <Button
                type="submit"
                variant="primary"
                className={styles.submit}
                disabled={state === "submitting"}
              >
                {state === "submitting" ? "Saving…" : "Set new password"}
              </Button>
            </form>
          </>
        )}

        {state === "success" && (
          <>
            <p className={styles.message}>Password updated — you can sign in now.</p>
            <Link
              href="/"
              className={`${buttonStyles.button} ${buttonStyles.primary} ${styles.submit}`}
            >
              Sign in
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <p className={`${styles.message} ${styles.errorMessage}`}>{GENERIC_INVALID}</p>
            <Link
              href="/"
              className={`${buttonStyles.button} ${buttonStyles.primary} ${styles.submit}`}
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetPageContent />
    </Suspense>
  );
}
