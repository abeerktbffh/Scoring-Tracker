"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  getPlayers,
  postAdminGame,
  renamePlayer,
  getPendingClaims,
  decideClaim,
  createInvite,
} from "@/lib/api";
import type { Player, PendingClaim, ClaimDecision } from "@/lib/api";
import { loadName } from "@/lib/rememberMe";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import styles from "./page.module.css";

type PlayersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; players: Player[] };

type ClaimsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; claims: PendingClaim[] };

interface NewGameForm {
  id: string;
  name: string;
  type: "outcome" | "timed";
  metricDirection: "lower_better" | "higher_better";
  hasVariants: boolean;
  parserId: string;
}

const EMPTY_GAME_FORM: NewGameForm = {
  id: "",
  name: "",
  type: "outcome",
  metricDirection: "lower_better",
  hasVariants: false,
  parserId: "",
};

export default function Admin(): JSX.Element {
  const [rememberedName, setRememberedName] = useState<string | null>(null);

  const [playersState, setPlayersState] = useState<PlayersState>({ status: "loading" });
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const [renameFeedback, setRenameFeedback] = useState<Record<string, string>>({});

  const [gameForm, setGameForm] = useState<NewGameForm>(EMPTY_GAME_FORM);
  const [gameSubmitting, setGameSubmitting] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [gameSuccess, setGameSuccess] = useState<string | null>(null);

  const [claimsState, setClaimsState] = useState<ClaimsState>({ status: "loading" });
  const [claimFeedback, setClaimFeedback] = useState<Record<string, string>>({});

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const loadPlayers = useCallback(() => {
    setPlayersState({ status: "loading" });
    getPlayers().then((result) => {
      if (!result.ok) {
        setPlayersState({ status: "error", message: result.error });
        return;
      }
      setPlayersState({ status: "ready", players: result.data.players });
      setEditedNames(
        Object.fromEntries(result.data.players.map((p) => [p.id, p.displayName]))
      );
    });
  }, []);

  const loadClaims = useCallback(() => {
    setClaimsState({ status: "loading" });
    getPendingClaims().then((result) => {
      if (!result.ok) {
        setClaimsState({ status: "error", message: result.error });
        return;
      }
      setClaimsState({ status: "ready", claims: result.data.claims });
    });
  }, []);

  useEffect(() => {
    setRememberedName(loadName());
    loadPlayers();
    loadClaims();
  }, [loadPlayers, loadClaims]);

  async function handleAddGame(e: React.FormEvent) {
    e.preventDefault();
    setGameError(null);
    setGameSuccess(null);
    setGameSubmitting(true);
    const result = await postAdminGame({
      id: gameForm.id,
      name: gameForm.name,
      type: gameForm.type,
      metricDirection: gameForm.metricDirection,
      hasVariants: gameForm.hasVariants,
      parserId: gameForm.parserId.trim() ? gameForm.parserId.trim() : null,
    });
    setGameSubmitting(false);
    if (result.ok) {
      setGameSuccess(`"${result.data.game.name}" added.`);
      setGameForm(EMPTY_GAME_FORM);
    } else {
      setGameError(result.error);
    }
  }

  async function handleRename(playerId: string) {
    const newName = editedNames[playerId] ?? "";
    setRenameFeedback((prev) => ({ ...prev, [playerId]: "" }));
    const result = await renamePlayer(playerId, newName);
    if (result.ok) {
      setRenameFeedback((prev) => ({ ...prev, [playerId]: "Renamed." }));
      setPlayersState((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              players: prev.players.map((p) => (p.id === playerId ? { ...p, displayName: newName } : p)),
            }
          : prev
      );
    } else {
      setRenameFeedback((prev) => ({ ...prev, [playerId]: result.error }));
    }
  }

  async function handleClaimDecision(claimId: string, decision: ClaimDecision) {
    setClaimFeedback((prev) => ({ ...prev, [claimId]: "" }));
    const result = await decideClaim(claimId, decision);
    if (result.ok) {
      loadClaims();
    } else {
      setClaimFeedback((prev) => ({ ...prev, [claimId]: result.error }));
    }
  }

  async function handleGenerateInvite() {
    setInviteError(null);
    setInviteCopied(false);
    setInviteGenerating(true);
    const result = await createInvite();
    setInviteGenerating(false);
    if (result.ok) {
      setInviteLink(result.data.link);
    } else {
      setInviteError(result.error);
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
    } catch {
      setInviteCopied(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Admin</h1>

      {claimsState.status === "ready" && claimsState.claims.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pending claims</h2>
          <Card>
            {claimsState.claims.map((claim) => (
              <div key={claim.id} className={styles.playerRow}>
                <div className={styles.claimInfo}>
                  <span>{claim.playerDisplayName}</span>
                  <span className={styles.settingsNote}>{claim.claimedByEmail}</span>
                </div>
                <Button variant="primary" onClick={() => handleClaimDecision(claim.id, "approve")}>
                  Approve
                </Button>
                <Button variant="ghost" onClick={() => handleClaimDecision(claim.id, "reject")}>
                  Reject
                </Button>
                {claimFeedback[claim.id] && (
                  <span className={styles.error}>{claimFeedback[claim.id]}</span>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invites</h2>
        <Card>
          <Button
            type="button"
            variant="primary"
            onClick={handleGenerateInvite}
            disabled={inviteGenerating}
          >
            {inviteGenerating ? "Generating…" : "Generate invite"}
          </Button>
          {inviteError && <p className={styles.error}>{inviteError}</p>}
          {inviteLink && (
            <div className={styles.inviteResult}>
              <p className={styles.settingsNote}>
                Copy this link now — it won&rsquo;t be shown again.
              </p>
              <code className={styles.inviteLink}>{inviteLink}</code>
              <Button type="button" variant="ghost" onClick={handleCopyInvite}>
                {inviteCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Add a game</h2>
        <Card>
          <form className={styles.form} onSubmit={handleAddGame}>
            <label className={styles.label} htmlFor="game-id">
              Game id
            </label>
            <input
              id="game-id"
              className={styles.input}
              type="text"
              value={gameForm.id}
              onChange={(e) => setGameForm((f) => ({ ...f, id: e.target.value }))}
            />

            <label className={styles.label} htmlFor="game-name">
              Game name
            </label>
            <input
              id="game-name"
              className={styles.input}
              type="text"
              value={gameForm.name}
              onChange={(e) => setGameForm((f) => ({ ...f, name: e.target.value }))}
            />

            <label className={styles.label} htmlFor="game-type">
              Type
            </label>
            <select
              id="game-type"
              className={styles.select}
              value={gameForm.type}
              onChange={(e) =>
                setGameForm((f) => ({ ...f, type: e.target.value as NewGameForm["type"] }))
              }
            >
              <option value="timed">timed</option>
              <option value="outcome">outcome</option>
            </select>

            <label className={styles.label} htmlFor="game-metric-direction">
              Metric direction
            </label>
            <select
              id="game-metric-direction"
              className={styles.select}
              value={gameForm.metricDirection}
              onChange={(e) =>
                setGameForm((f) => ({
                  ...f,
                  metricDirection: e.target.value as NewGameForm["metricDirection"],
                }))
              }
            >
              <option value="lower_better">lower_better</option>
              <option value="higher_better">higher_better</option>
            </select>

            <label className={styles.checkboxRow} htmlFor="game-has-variants">
              <input
                id="game-has-variants"
                type="checkbox"
                checked={gameForm.hasVariants}
                onChange={(e) => setGameForm((f) => ({ ...f, hasVariants: e.target.checked }))}
              />
              Has variants
            </label>

            <label className={styles.label} htmlFor="game-parser-id">
              Parser id (optional)
            </label>
            <input
              id="game-parser-id"
              className={styles.input}
              type="text"
              value={gameForm.parserId}
              onChange={(e) => setGameForm((f) => ({ ...f, parserId: e.target.value }))}
            />

            {gameError && <p className={styles.error}>{gameError}</p>}
            {gameSuccess && <p className={styles.success}>{gameSuccess}</p>}

            <Button type="submit" variant="primary" className={styles.submit} disabled={gameSubmitting}>
              {gameSubmitting ? "Adding…" : "Add game"}
            </Button>
          </form>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Players</h2>
        <Card>
          {playersState.status === "loading" && (
            <div className={styles.skeletonRows}>
              <Skeleton h={20} />
              <Skeleton h={20} />
            </div>
          )}
          {playersState.status === "error" && (
            <ErrorState message={playersState.message} onRetry={loadPlayers} />
          )}
          {playersState.status === "ready" && playersState.players.length === 0 && (
            <EmptyState title="No players yet" body="Players will appear here once they've logged an entry." />
          )}
          {playersState.status === "ready" &&
            playersState.players.map((player) => (
              <div key={player.id} className={styles.playerRow}>
                <input
                  className={styles.playerInput}
                  type="text"
                  aria-label={`Name for ${player.displayName}`}
                  value={editedNames[player.id] ?? ""}
                  onChange={(e) =>
                    setEditedNames((prev) => ({ ...prev, [player.id]: e.target.value }))
                  }
                />
                <Button variant="ghost" onClick={() => handleRename(player.id)}>
                  Rename
                </Button>
                {renameFeedback[player.id] && (
                  <span className={styles.success}>{renameFeedback[player.id]}</span>
                )}
              </div>
            ))}
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Settings</h2>
        <Card>
          <div className={styles.settingsRow}>
            <span>Remembered name: {rememberedName ?? "None saved on this device"}</span>
            <p className={styles.settingsNote}>
              The theme toggle lives in the drawer menu.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
