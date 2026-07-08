"use client";
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { postEntry } from "@/lib/api";
import styles from "./page.module.css";

type State =
  | { status: "logging" }
  | { status: "success"; game: string }
  | { status: "error"; message: string }
  | { status: "empty" };

function ShareTargetInner(): JSX.Element {
  const params = useSearchParams();
  const text = (params.get("text") ?? params.get("url") ?? "").trim();
  const [state, setState] = useState<State>(text ? { status: "logging" } : { status: "empty" });

  useEffect(() => {
    if (!text) return;
    let live = true;
    postEntry({ rawInput: text }).then((res) => {
      if (!live) return;
      if (res.ok) setState({ status: "success", game: res.data.parsed.gameId });
      else setState({ status: "error", message: res.error });
    });
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <div className={styles.wrap}>
      {state.status === "logging" && <p className={styles.msg}>Logging your result…</p>}
      {state.status === "success" && (
        <>
          <p className={styles.ok}>✓ Logged {state.game}</p>
          <Link className={styles.link} href="/">See the board</Link>
        </>
      )}
      {state.status === "error" && (
        <>
          <p className={styles.err}>{state.message}</p>
          <Link className={styles.link} href="/log">Paste it instead</Link>
        </>
      )}
      {state.status === "empty" && (
        <>
          <p className={styles.msg}>Nothing to import — share a result from a game.</p>
          <Link className={styles.link} href="/log">Log one manually</Link>
        </>
      )}
    </div>
  );
}

export default function ShareTarget(): JSX.Element {
  return (
    <Suspense fallback={<div className={styles.wrap}><p className={styles.msg}>Logging your result…</p></div>}>
      <ShareTargetInner />
    </Suspense>
  );
}
