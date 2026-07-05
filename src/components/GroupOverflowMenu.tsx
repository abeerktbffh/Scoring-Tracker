"use client";
import React, { useState } from "react";
import { useBoard } from "@/components/BoardContext";
import { Menu, MenuItem } from "@/components/Menu";
import { Ellipsis } from "@/design/icons";
import { getGroupInvite, leaveGroup } from "@/lib/api";
import styles from "./GroupOverflowMenu.module.css";

export interface GroupOverflowMenuProps {
  onManage: () => void;
}

type Panel = "menu" | "invite" | "leave-confirm";

export function GroupOverflowMenu({ onManage }: GroupOverflowMenuProps): JSX.Element | null {
  const { board, select, refresh } = useBoard();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (!board) {
    return null;
  }

  function resetPanels(): void {
    setPanel("menu");
    setInviteLink(null);
    setInviteError(null);
    setInviteLoading(false);
    setCopied(false);
  }

  function close(): void {
    setOpen(false);
    resetPanels();
  }

  function handleManage(): void {
    onManage();
    close();
  }

  async function handleInvite(): Promise<void> {
    setPanel("invite");
    setInviteLoading(true);
    setInviteError(null);
    const result = await getGroupInvite(board!.id);
    setInviteLoading(false);
    if (result.ok) {
      setInviteLink(result.data.link);
    } else {
      setInviteError(result.error);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!inviteLink) return;
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    await clipboard.writeText(inviteLink);
    setCopied(true);
  }

  async function handleLeaveConfirmed(): Promise<void> {
    setLeaving(true);
    const result = await leaveGroup(board!.id);
    setLeaving(false);
    if (result.ok) {
      select(null);
      await refresh();
      close();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Group options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Ellipsis size={20} />
      </button>

      <Menu open={open} onClose={close}>
        {panel === "menu" && (
          <>
            {board.role === "admin" && <MenuItem onClick={handleManage}>Manage group</MenuItem>}
            <MenuItem onClick={handleInvite}>Invite</MenuItem>
            <MenuItem danger onClick={() => setPanel("leave-confirm")}>
              Leave group
            </MenuItem>
          </>
        )}

        {panel === "invite" && (
          <div className={styles.section}>
            {inviteLoading && <p className={styles.hint}>Loading invite link…</p>}
            {inviteError && <p className={styles.error}>{inviteError}</p>}
            {inviteLink && (
              <>
                <p className={styles.link}>{inviteLink}</p>
                <button type="button" className={styles.actionButton} onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </>
            )}
            <button type="button" className={styles.backButton} onClick={() => setPanel("menu")}>
              Back
            </button>
          </div>
        )}

        {panel === "leave-confirm" && (
          <div className={styles.section}>
            <p className={styles.hint}>
              Are you sure? Leaving {board.name} means you&apos;ll need a new invite to rejoin.
            </p>
            <div className={styles.confirmRow}>
              <button type="button" className={styles.actionButton} onClick={() => setPanel("menu")}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleLeaveConfirmed}
                disabled={leaving}
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </Menu>
    </>
  );
}
