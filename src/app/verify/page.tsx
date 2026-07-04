"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import buttonStyles from "@/components/Button.module.css";
import styles from "./page.module.css";

const GENERIC_INVALID = "This verification link is invalid or has expired.";

type State = "loading" | "success" | "error";

function VerifyPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    let cancelled = false;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? "success" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.kicker}>Bragboard</p>
        <h1 className={styles.headline}>Email verification</h1>

        {state === "loading" && <p className={styles.sub}>Verifying your email…</p>}

        {state === "success" && (
          <>
            <p className={styles.message}>
              Your email is verified — you can sign in now.
            </p>
            <Link
              href="/"
              className={`${buttonStyles.button} ${buttonStyles.primary} ${styles.cta}`}
            >
              Go to sign in
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <p className={`${styles.message} ${styles.error}`}>{GENERIC_INVALID}</p>
            <Link
              href="/"
              className={`${buttonStyles.button} ${buttonStyles.primary} ${styles.cta}`}
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
