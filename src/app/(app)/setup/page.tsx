"use client";
import React, { useState } from "react";
import { detectPlatform } from "@/lib/platform";
import { getMe, mintImportToken } from "@/lib/api";
import { formatResult } from "@/lib/formatResult";
import styles from "./page.module.css";

// The shared "Start Bragging" shortcut. Public + stable (the per-user key is an
// iOS Import Question, so nothing secret travels in the link). Baked as the
// default; NEXT_PUBLIC_IOS_SHORTCUT_URL can override it if it ever changes.
const DEFAULT_SHORTCUT_URL = "https://www.icloud.com/shortcuts/c3ecc98935394c6e94b1b7a039d5a598";
const SHORTCUT_URL = process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL || DEFAULT_SHORTCUT_URL;

function CopyKey(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onCopy() {
    setError(null);
    const res = await mintImportToken();
    if (!res.ok) { setError("Couldn't create your key — try again."); return; }
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.writeText) await clip.writeText(res.data.token);
    setCopied(true);
  }
  return (
    <div className={styles.step}>
      <button type="button" className={styles.btn} onClick={onCopy}>Copy your key</button>
      {copied && <span className={styles.ok}>Copied — paste it into the shortcut when it asks.</span>}
      {error && <span className={styles.err}>{error}</span>}
    </div>
  );
}

function IosSteps(): JSX.Element {
  return (
    <ol className={styles.steps}>
      <li>
        {SHORTCUT_URL
          ? <a className={styles.btn} href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">Add the Bragboard shortcut</a>
          : <span className={styles.muted}>iPhone setup is coming soon.</span>}
      </li>
      <li><CopyKey /><span className={styles.muted}>When you add the shortcut, it asks <b>&quot;Paste your Bragboard key&quot;</b> — paste it there. (Confirmed: the shortcut uses an iOS Import Question, so there&apos;s no editing.)</span></li>
      <li><span className={styles.muted}>Tap <b>Allow</b> the first time the shortcut runs.</span></li>
      <li><span className={styles.muted}>In a game&apos;s Share sheet, if you don&apos;t see <b>Start Bragging</b>, tap <b>More</b> and turn it on once.</span></li>
    </ol>
  );
}

function AndroidSteps(): JSX.Element {
  const [deferred, setDeferred] = useState<any>(null);
  React.useEffect(() => {
    const onBIP = (e: any) => { e.preventDefault?.(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);
  return (
    <ol className={styles.steps}>
      <li>
        <button type="button" className={styles.btn} onClick={() => deferred?.prompt?.()}>Install app</button>
        <span className={styles.muted}>{deferred ? "Then reopen Bragboard from your home screen." : "If nothing happens, use Chrome's menu → Install app."}</span>
      </li>
      <li><span className={styles.muted}>Once installed, tap a game&apos;s <b>Share</b> and choose Bragboard.</span></li>
    </ol>
  );
}

function CheckIt(): JSX.Element {
  const [result, setResult] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  async function onCheck() {
    setChecked(true);
    const res = await getMe(""); // session-scoped; returns the viewer's own recent list
    if (res.ok && res.data.recent.length > 0) {
      const r = res.data.recent[0];
      setResult(`✓ We see it: ${r.gameId} ${formatResult(r.gameId, r.value, r.solved, r.detail)}`);
    } else {
      setResult(null);
    }
  }
  return (
    <div className={styles.step}>
      <button type="button" className={styles.btn} onClick={onCheck}>Check that it worked</button>
      {checked && (result ? <span className={styles.ok}>{result}</span>
        : <span className={styles.muted}>Nothing yet — share a result from a game, then check again.</span>)}
    </div>
  );
}

export default function Setup(): JSX.Element {
  const platform = detectPlatform();
  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>Set up auto-log</h1>
      <p className={styles.lede}>Log a result by tapping <b>Share</b> in a game and choosing Bragboard — no more copy-paste.</p>
      {platform === "ios" && <IosSteps />}
      {platform === "android" && <AndroidSteps />}
      {platform === "other" && <p className={styles.muted}>Auto-log is a phone feature — open Bragboard on your phone to set it up.</p>}
      <CheckIt />
    </div>
  );
}
