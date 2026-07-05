"use client";
import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import { getGroupPreview, joinGroup } from "@/lib/api";
import styles from "./JoinGroup.module.css";

export interface JoinGroupProps {
  token: string;
  onClose: () => void;
  onJoined: (groupId: string) => void;
}

interface Preview {
  id: string;
  name: string;
  memberCount: number;
  gameCount: number;
}

export function JoinGroup({ token, onClose, onJoined }: JoinGroupProps): JSX.Element {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    getGroupPreview(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.data.group);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleJoin(): Promise<void> {
    setJoining(true);
    setError(null);
    const result = await joinGroup(token);
    setJoining(false);
    if (result.ok) {
      onJoined(result.data.groupId);
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <div className={styles.backdrop} data-testid="join-group-backdrop" aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-modal="true">
        {error ? (
          <div className={styles.section}>
            <p className={styles.error}>{error}</p>
            <div className={styles.actions}>
              <Button type="button" variant="primary" onClick={onClose}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : loading ? (
          <p className={styles.hint}>Loading invite…</p>
        ) : preview ? (
          <div className={styles.section}>
            <p className={styles.title}>Join {preview.name}?</p>
            <p className={styles.hint}>
              {preview.memberCount} members &middot; {preview.gameCount} games
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={onClose}>
                Not now
              </button>
              <Button type="button" variant="primary" onClick={handleJoin} disabled={joining}>
                {joining ? "Joining…" : "Join"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
