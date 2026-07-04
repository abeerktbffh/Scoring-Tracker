"use client";
import React, { useState } from "react";
import { Button } from "./Button";
import styles from "./Onboarding.module.css";

export interface UnclaimedPlayer {
  id: string;
  displayName: string;
}

export interface OnboardingProps {
  migrationActive: boolean;
  unclaimed: UnclaimedPlayer[];
  onClaim: (playerId: string) => Promise<boolean>;
  onCreate: (displayName: string) => Promise<boolean>;
}

type Step = "choose" | "claim" | "create" | "pending";

export function Onboarding({
  migrationActive,
  unclaimed,
  onClaim,
  onCreate,
}: OnboardingProps): JSX.Element {
  const showClaimOption = migrationActive && unclaimed.length > 0;
  const [step, setStep] = useState<Step>(showClaimOption ? "claim" : "create");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(playerId: string) {
    setError(null);
    setSubmitting(true);
    const ok = await onClaim(playerId);
    setSubmitting(false);
    if (ok) {
      setStep("pending");
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

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

        {step === "claim" && (
          <>
            <h1 className={styles.headline}>Is one of these you?</h1>
            <p className={styles.sub}>
              Pick your name from the old board, or create a fresh player.
            </p>
            <ul className={styles.list}>
              {unclaimed.map((player) => (
                <li key={player.id} className={styles.listItem}>
                  <button
                    type="button"
                    className={styles.listButton}
                    disabled={submitting}
                    onClick={() => handleClaim(player.id)}
                  >
                    {player.displayName}
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.links}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setError(null);
                  setStep("create");
                }}
              >
                I&rsquo;m new — create my player
              </button>
            </div>
          </>
        )}

        {step === "create" && (
          <>
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

            {showClaimOption && (
              <div className={styles.links}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setError(null);
                    setStep("claim");
                  }}
                >
                  Back to claim a name
                </button>
              </div>
            )}
          </>
        )}

        {step === "pending" && (
          <>
            <h1 className={styles.headline}>Almost there.</h1>
            <p className={styles.sub}>Waiting for the owner to approve your claim.</p>
          </>
        )}
      </div>
    </div>
  );
}
