"use client";
import React, { useState } from "react";
import type { Game } from "@/lib/api";
import { Menu, MenuItem } from "@/components/Menu";
import { ChevronDown } from "@/design/icons";
import styles from "./GameWindowNav.module.css";

const WINDOW_LABELS: { k: string; label: string }[] = [
  { k: "daily", label: "Today" },
  { k: "weekly", label: "This week" },
  { k: "monthly", label: "This month" },
  { k: "all", label: "All-time" },
];

export interface GameWindowNavProps {
  games: Game[];
  gameKey: string; // "overall" | gameId
  onGameChange: (key: string) => void;
  windowKey: string;
  onWindowChange: (key: string) => void;
}

export function GameWindowNav({ games, gameKey, onGameChange, windowKey, onWindowChange }: GameWindowNavProps): JSX.Element {
  const [gameOpen, setGameOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  const gameLabel = gameKey === "overall" ? "Overall" : games.find((x) => x.id === gameKey)?.name ?? "Overall";
  const windowLabel = WINDOW_LABELS.find((w) => w.k === windowKey)?.label ?? "This week";

  return (
    <div className={styles.row}>
      <button type="button" className={styles.control} aria-label="Game" onClick={() => setGameOpen(true)}>
        {gameLabel} <ChevronDown size={16} />
      </button>
      <button type="button" className={styles.control} aria-label="Window" onClick={() => setWindowOpen(true)}>
        {windowLabel} <ChevronDown size={16} />
      </button>

      <Menu open={gameOpen} onClose={() => setGameOpen(false)} title="Game">
        <MenuItem onClick={() => { onGameChange("overall"); setGameOpen(false); }}>Overall</MenuItem>
        {games.map((game) => (
          <MenuItem key={game.id} onClick={() => { onGameChange(game.id); setGameOpen(false); }}>
            {game.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu open={windowOpen} onClose={() => setWindowOpen(false)} title="Window">
        {WINDOW_LABELS.map((w) => (
          <MenuItem key={w.k} onClick={() => { onWindowChange(w.k); setWindowOpen(false); }}>
            {w.label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
