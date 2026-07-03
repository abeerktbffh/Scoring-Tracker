import React from "react";
import styles from "./Tile.module.css";

export type TileState = "solved" | "partial" | "empty";

export interface TileProps {
  state: TileState;
  children?: React.ReactNode;
}

export function Tile({ state, children }: TileProps): JSX.Element {
  return (
    <div className={styles.tile} data-state={state}>
      {children}
    </div>
  );
}
