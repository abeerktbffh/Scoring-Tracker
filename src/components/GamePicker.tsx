import React, { useMemo, useState } from "react";
import { Search } from "@/design/icons";
import { filterAndOrderGames, type GameOption } from "@/lib/gameFilter";
import styles from "./GamePicker.module.css";

export interface GamePickerProps {
  games: GameOption[];
  dueTodayIds: string[];
  onPick: (gameId: string) => void;
}

export function GamePicker({ games, dueTodayIds, onPick }: GamePickerProps): JSX.Element {
  const [query, setQuery] = useState("");

  const { due, rest } = useMemo(
    () => filterAndOrderGames(games, query, dueTodayIds),
    [games, query, dueTodayIds]
  );

  return (
    <div className={styles.picker}>
      <div className={styles.search}>
        <Search size={14} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search games…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {due.length > 0 && (
        <>
          <h4 className={styles.label}>Today · not yet logged</h4>
          <ul className={styles.list}>
            {due.map((game) => (
              <li key={game.id} className={styles.rowToday}>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => onPick(game.id)}
                >
                  <span className={styles.name}>{game.name}</span>
                  <span className={styles.dueDot}>DUE</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className={styles.label}>All games ({rest.length})</h4>
      <ul className={styles.list}>
        {rest.map((game) => (
          <li key={game.id} className={styles.row}>
            <button type="button" className={styles.rowButton} onClick={() => onPick(game.id)}>
              <span className={styles.name}>{game.name}</span>
              <span className={styles.chev}>›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
