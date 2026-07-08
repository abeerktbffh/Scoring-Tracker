"use client";
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getGames, postEntry } from "@/lib/api";
import { formatResult } from "@/lib/formatResult";
import styles from "./page.module.css";

type State =
  | { status: "logging" }
  | { status: "success"; gameName: string; resultText: string }
  | { status: "error"; message: string }
  | { status: "empty" };

function ShareTargetInner(): JSX.Element {
  const params = useSearchParams();
  const text = (params.get("text") ?? params.get("url") ?? "").trim();
  const [state, setState] = useState<State>(text ? { status: "logging" } : { status: "empty" });

  useEffect(() => {
    if (!text) return;
    let live = true;
    postEntry({ rawInput: text }).then(async (res) => {
      if (!live) return;
      if (!res.ok) {
        setState({ status: "error", message: res.error });
        return;
      }
      const { gameId, value, solved, detail } = res.data.parsed;
      const resultText = formatResult(gameId, value, solved, detail);
      let gameName = gameId;
      const gamesRes = await getGames();
      if (live && gamesRes.ok) {
        gameName = gamesRes.data.games.find((g) => g.id === gameId)?.name ?? gameId;
      }
      if (live) setState({ status: "success", gameName, resultText });
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
          <p className={styles.ok}>Logged {state.gameName} {state.resultText}</p>
          <Link className={styles.link} href="/standings">See the board</Link>
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
