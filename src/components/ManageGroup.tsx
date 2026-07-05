"use client";
import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import { useBoard } from "./BoardContext";
import {
  getGames,
  getGroupMembers,
  renameGroup,
  setGroupGames,
  removeMember,
  resetGroupInvite,
  deleteGroup,
  type Game,
} from "@/lib/api";
import styles from "./ManageGroup.module.css";

export interface ManageGroupProps {
  groupId: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

interface Member {
  userId: string;
  displayName: string | null;
  role: "admin" | "member";
}

export function ManageGroup({ groupId, onClose, onChanged, onDeleted }: ManageGroupProps): JSX.Element {
  const { board } = useBoard();

  const [name, setName] = useState(board?.name ?? "");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [games, setGamesState] = useState<Game[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [gamesLoading, setGamesLoading] = useState(true);
  const [savingGames, setSavingGames] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setName(board?.name ?? "");
  }, [board?.name, groupId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMembers(): Promise<void> {
      setMembersLoading(true);
      setMembersError(null);
      const result = await getGroupMembers(groupId);
      if (cancelled) return;
      setMembersLoading(false);
      if (result.ok) {
        setMembers(result.data.members);
      } else {
        setMembersError(result.error);
      }
    }
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    async function loadGames(): Promise<void> {
      setGamesLoading(true);
      setGamesError(null);
      const [catalogResult, trackedResult] = await Promise.all([getGames(), getGames(groupId)]);
      if (cancelled) return;
      setGamesLoading(false);

      if (!catalogResult.ok) {
        setGamesError(catalogResult.error);
        return;
      }
      setGamesState(catalogResult.data.games);

      const trackedIds = new Set(trackedResult.ok ? trackedResult.data.games.map((g) => g.id) : []);
      const nextChecked: Record<string, boolean> = {};
      for (const game of catalogResult.data.games) {
        nextChecked[game.id] = trackedIds.has(game.id);
      }
      setChecked(nextChecked);

      if (!trackedResult.ok) {
        setGamesError(trackedResult.error);
      }
    }
    loadGames();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function toggleGame(id: string): void {
    setChecked((current) => ({ ...current, [id]: !current[id] }));
  }

  async function handleRename(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setRenaming(true);
    setRenameError(null);
    const result = await renameGroup(groupId, trimmed);
    setRenaming(false);
    if (result.ok) {
      onChanged();
    } else {
      setRenameError(result.error);
    }
  }

  async function handleSaveGames(): Promise<void> {
    setSavingGames(true);
    setGamesError(null);
    const gameIds = games.filter((g) => checked[g.id]).map((g) => g.id);
    const result = await setGroupGames(groupId, gameIds);
    setSavingGames(false);
    if (result.ok) {
      onChanged();
    } else {
      setGamesError(result.error);
    }
  }

  async function handleRemove(userId: string): Promise<void> {
    setRemovingId(userId);
    setMembersError(null);
    const result = await removeMember(groupId, userId);
    if (result.ok) {
      const refreshed = await getGroupMembers(groupId);
      if (refreshed.ok) {
        setMembers(refreshed.data.members);
      }
    } else {
      setMembersError(result.error);
    }
    setRemovingId(null);
  }

  async function handleResetInvite(): Promise<void> {
    setInviteLoading(true);
    setCopied(false);
    const result = await resetGroupInvite(groupId);
    setInviteLoading(false);
    if (result.ok) {
      setInviteLink(result.data.link);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!inviteLink) return;
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    await clipboard.writeText(inviteLink);
    setCopied(true);
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteGroup(groupId);
    setDeleting(false);
    if (result.ok) {
      onDeleted();
    } else {
      setDeleteError(result.error);
    }
  }

  return (
    <>
      <div
        className={styles.backdrop}
        data-testid="manage-group-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={styles.panel} role="dialog" aria-modal="true">
        <p className={styles.title}>Manage group</p>

        <form onSubmit={handleRename} className={styles.section}>
          <label className={styles.label} htmlFor="manage-group-name">
            Group name
          </label>
          <div className={styles.row}>
            <input
              id="manage-group-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            <Button type="submit" variant="primary" disabled={!name.trim() || renaming}>
              {renaming ? "Saving…" : "Save"}
            </Button>
          </div>
          {renameError && <p className={styles.error}>{renameError}</p>}
        </form>

        <div className={styles.section}>
          <p className={styles.label}>Games</p>
          {gamesLoading && <p className={styles.hint}>Loading games…</p>}
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
          {gamesError && <p className={styles.error}>{gamesError}</p>}
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleSaveGames}
            disabled={savingGames || gamesLoading}
          >
            {savingGames ? "Saving…" : "Save games"}
          </button>
        </div>

        <div className={styles.section}>
          <p className={styles.label}>Members</p>
          {membersLoading && <p className={styles.hint}>Loading members…</p>}
          {membersError && <p className={styles.error}>{membersError}</p>}
          <ul className={styles.memberList}>
            {members.map((member) => (
              <li key={member.userId} className={styles.memberItem}>
                <span className={styles.memberName}>{member.displayName ?? "Unnamed"}</span>
                <span className={styles.memberRole}>{member.role}</span>
                {member.role !== "admin" && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => handleRemove(member.userId)}
                    disabled={removingId === member.userId}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.section}>
          <p className={styles.label}>Invite link</p>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleResetInvite}
            disabled={inviteLoading}
          >
            {inviteLoading ? "Resetting…" : "Reset link"}
          </button>
          {inviteLink && (
            <>
              <p className={styles.link}>{inviteLink}</p>
              <button type="button" className={styles.copyButton} onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </>
          )}
        </div>

        <div className={styles.section}>
          <p className={styles.label}>Danger zone</p>
          {!deleteConfirm ? (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => setDeleteConfirm(true)}
            >
              Delete group
            </button>
          ) : (
            <div className={styles.section}>
              <p className={styles.hint}>This will permanently delete the group for everyone.</p>
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
              {deleteError && <p className={styles.error}>{deleteError}</p>}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
