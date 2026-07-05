"use client";
import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import { getGames, createGroup, type Game } from "@/lib/api";
import styles from "./CreateGroup.module.css";

export interface CreateGroupProps {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}

export function CreateGroup({ open, onClose, onCreated }: CreateGroupProps): JSX.Element | null {
  const [games, setGames] = useState<Game[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setName("");
    setError(null);
    setLink(null);
    setCopied(false);
    setCreatedId(null);
    getGames().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setGames(result.data.games);
        const allChecked: Record<string, boolean> = {};
        for (const game of result.data.games) {
          allChecked[game.id] = true;
        }
        setChecked(allChecked);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function toggleGame(id: string): void {
    setChecked((current) => ({ ...current, [id]: !current[id] }));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const gameIds = games.filter((g) => checked[g.id]).map((g) => g.id);
    const result = await createGroup(trimmed, gameIds);
    setSubmitting(false);
    if (result.ok) {
      setLink(result.data.link);
      setCreatedId(result.data.id);
      onCreated(result.data.id);
    } else {
      setError(result.error);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!link) return;
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    await clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <>
      <div
        className={styles.backdrop}
        data-testid="create-group-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={styles.panel} role="dialog" aria-modal="true">
        <p className={styles.title}>New group</p>

        {createdId ? (
          <div className={styles.section}>
            <p className={styles.hint}>Share this link to invite people to the group.</p>
            {link && <p className={styles.link}>{link}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.copyButton} onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <Button type="button" variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="create-group-name">
              Group name
            </label>
            <input
              id="create-group-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />

            <p className={styles.label}>Games</p>
            <ul className={styles.gameList}>
              {games.map((game) => (
                <li key={game.id} className={styles.gameItem}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!checked[game.id]}
                      onChange={() => toggleGame(game.id)}
                      aria-label={game.name}
                    />
                    {game.name}
                  </label>
                </li>
              ))}
            </ul>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <Button type="submit" variant="primary" disabled={!name.trim() || submitting}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
