"use client";
import React, { useState } from "react";
import { Button } from "./Button";
import styles from "./Onboarding.module.css";

export interface OnboardingProps {
  onCreate: (displayName: string) => Promise<boolean>;
}

export function Onboarding({ onCreate }: OnboardingProps): JSX.Element {
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    const ok = await onCreate(trimmed);
    setSubmitting(false);
    if (!ok) {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.kicker}>Bragboard</p>

        <h1 className={styles.headline}>What should we call you?</h1>
        <p className={styles.sub}>This is the name that shows up on the board.</p>

        <form onSubmit={handleCreate}>
          <label className={styles.label} htmlFor="onboarding-display-name">
            Display name
          </label>
          <input
            id="onboarding-display-name"
            className={styles.input}
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create my player"}
          </Button>
        </form>
      </div>
    </div>
  );
}
