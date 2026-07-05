"use client";
import React, { useState } from "react";
import { useBoard } from "@/components/BoardContext";
import { Menu, MenuItem, MenuLabel } from "@/components/Menu";
import { ChevronDown, Check } from "@/design/icons";
import styles from "./BoardSwitcher.module.css";

export interface BoardSwitcherProps {
  onNewGroup: () => void;
}

export function BoardSwitcher({ onNewGroup }: BoardSwitcherProps): JSX.Element {
  const { boardId, board, groups, select } = useBoard();
  const [open, setOpen] = useState(false);

  const title = boardId === null ? "Global" : board?.name ?? "Global";

  function choose(id: string | null) {
    select(id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={styles.title}>{title}</span>
        <ChevronDown size={18} className={styles.chevron} />
      </button>

      <Menu open={open} onClose={() => setOpen(false)}>
        <MenuLabel>Your boards</MenuLabel>
        <MenuItem
          onClick={() => choose(null)}
          icon={boardId === null ? <Check size={16} /> : undefined}
        >
          Global
        </MenuItem>
        {groups.map((g) => (
          <MenuItem
            key={g.id}
            onClick={() => choose(g.id)}
            icon={boardId === g.id ? <Check size={16} /> : undefined}
          >
            {g.name}
          </MenuItem>
        ))}
        <div className={styles.divider} />
        <MenuItem onClick={onNewGroup}>
          <span className={styles.newGroup}>+ New group</span>
        </MenuItem>
      </Menu>
    </>
  );
}
