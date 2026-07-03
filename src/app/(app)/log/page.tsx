"use client";
import React, { useCallback, useEffect, useState } from "react";
import { getGames, getMe, postEntry } from "@/lib/api";
import type { Game } from "@/lib/api";
import { loadName, saveName } from "@/lib/rememberMe";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GamePicker } from "@/components/GamePicker";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/Skeleton";
import styles from "./page.module.css";

type GamesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; games: Game[] };

export default function Log(): JSX.Element {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [gamesState, setGamesState] = useState<GamesState>({ status: "loading" });
  const [dueTodayIds, setDueTodayIds] = useState<string[]>([]);

  const [rawInput, setRawInput] = useState("");
  const [pasteSubmitting, setPasteSubmitting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteConfirmation, setPasteConfirmation] = useState<string | null>(null);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [solved, setSolved] = useState(false);
  const [variant, setVariant] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualConfirmation, setManualConfirmation] = useState<string | null>(null);

  const loadGames = useCallback(() => {
    setGamesState({ status: "loading" });
    getGames().then((result) => {
      if (!result.ok) {
        setGamesState({ status: "error", message: result.error });
        return;
      }
      setGamesState({ status: "ready", games: result.data.games });
    });
  }, []);

  useEffect(() => {
    const displayName = loadName();
    if (displayName) setName(displayName);
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!name.trim()) {
      setDueTodayIds([]);
      return;
    }
    getMe(name).then((result) => {
      if (!result.ok) return;
      setDueTodayIds(
        result.data.today.games.filter((g) => !g.logged).map((g) => g.gameId)
      );
    });
  }, [name]);

  function handleNameChange(next: string) {
    setName(next);
    if (next.trim()) saveName(next);
  }

  function describeParsed(parsed: { gameId: string; value: number; [key: string]: unknown }): string {
    const game = gamesState.status === "ready" ? gamesState.games.find((g) => g.id === parsed.gameId) : undefined;
    const label = game?.name ?? parsed.gameId;
    return `Saved: ${label} ${parsed.value}`;
  }

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasteError(null);
    setPasteConfirmation(null);
    setPasteSubmitting(true);
    const result = await postEntry({ displayName: name, pin, rawInput });
    setPasteSubmitting(false);
    if (!result.ok) {
      setPasteError(result.error);
      return;
    }
    setPasteConfirmation(describeParsed(result.data.parsed));
    setRawInput("");
    loadGames();
  }

  function handlePickGame(gameId: string) {
    setSelectedGameId(gameId);
    setValue("");
    setSolved(false);
    setVariant("");
    setManualError(null);
    setManualConfirmation(null);
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGameId) return;
    setManualError(null);
    setManualConfirmation(null);
    setManualSubmitting(true);
    const selectedGame = gamesState.status === "ready" ? gamesState.games.find((g) => g.id === selectedGameId) : undefined;
    const result = await postEntry({
      displayName: name,
      pin,
      gameId: selectedGameId,
      ...(selectedGame?.hasVariants && variant ? { variant } : {}),
      value: Number(value),
      solved,
    });
    setManualSubmitting(false);
    if (!result.ok) {
      setManualError(result.error);
      return;
    }
    setManualConfirmation(describeParsed(result.data.parsed));
    setSelectedGameId(null);
    setValue("");
    setSolved(false);
    setVariant("");
  }

  const selectedGame =
    gamesState.status === "ready" ? gamesState.games.find((g) => g.id === selectedGameId) ?? null : null;

  const canSubmit = name.trim().length > 0 && pin.trim().length > 0;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Log a result</h1>

      <Card className={styles.identity}>
        <label className={styles.identityLabel} htmlFor="log-name">
          Name
        </label>
        <input
          id="log-name"
          className={styles.identityInput}
          type="text"
          placeholder="Who are you?"
          autoComplete="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
        <label className={styles.identityLabel} htmlFor="log-pin">
          PIN
        </label>
        <input
          id="log-pin"
          className={styles.identityInput}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Your PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </Card>

      <form className={styles.pasteSection} onSubmit={handlePasteSubmit}>
        <p className={styles.label}>Paste &amp; we&rsquo;ll figure it out</p>
        <textarea
          className={styles.textarea}
          placeholder="Paste share text here…"
          value={rawInput}
          onChange={(e) => {
            setRawInput(e.target.value);
            setPasteError(null);
            setPasteConfirmation(null);
          }}
          rows={6}
        />
        {pasteError && <p className={styles.error}>{pasteError}</p>}
        {pasteConfirmation && <p className={styles.confirmation}>{pasteConfirmation}</p>}
        <Button
          type="submit"
          variant="primary"
          className={styles.submit}
          disabled={!canSubmit || !rawInput.trim() || pasteSubmitting}
        >
          {pasteSubmitting ? "Logging…" : "Log it"}
        </Button>
      </form>

      <p className={styles.divider}>— or enter by hand —</p>

      {gamesState.status === "loading" && (
        <div className={styles.skeletonRows}>
          <Skeleton h={20} />
          <Skeleton h={20} />
          <Skeleton h={20} />
        </div>
      )}

      {gamesState.status === "error" && <ErrorState message={gamesState.message} onRetry={loadGames} />}

      {gamesState.status === "ready" && gamesState.games.length === 0 && (
        <EmptyState title="No games yet" body="Games will appear here once they're added." />
      )}

      {gamesState.status === "ready" && gamesState.games.length > 0 && !selectedGame && (
        <GamePicker games={gamesState.games} dueTodayIds={dueTodayIds} onPick={handlePickGame} />
      )}

      {selectedGame && (
        <form className={styles.manualSection} onSubmit={handleManualSubmit}>
          <div className={styles.manualHeader}>
            <span className={styles.manualGameName}>{selectedGame.name}</span>
            <button type="button" className={styles.changeGame} onClick={() => setSelectedGameId(null)}>
              Change
            </button>
          </div>

          {selectedGame.hasVariants && (
            <>
              <label className={styles.identityLabel} htmlFor="log-variant">
                Difficulty
              </label>
              <input
                id="log-variant"
                className={styles.identityInput}
                type="text"
                placeholder="e.g. easy, hard"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
              />
            </>
          )}

          <label className={styles.identityLabel} htmlFor="log-value">
            Value
          </label>
          <input
            id="log-value"
            className={styles.identityInput}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />

          <label className={styles.solvedRow} htmlFor="log-solved">
            <input
              id="log-solved"
              type="checkbox"
              checked={solved}
              onChange={(e) => setSolved(e.target.checked)}
            />
            Solved
          </label>

          {manualError && <p className={styles.error}>{manualError}</p>}
          {manualConfirmation && <p className={styles.confirmation}>{manualConfirmation}</p>}

          <Button
            type="submit"
            variant="amber"
            className={styles.submit}
            disabled={!canSubmit || value.trim() === "" || manualSubmitting}
          >
            {manualSubmitting ? "Saving…" : "Save entry"}
          </Button>
        </form>
      )}
    </div>
  );
}
