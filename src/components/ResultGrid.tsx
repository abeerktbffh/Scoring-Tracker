import React from "react";
import styles from "./ResultGrid.module.css";

export interface ResultGridProps {
  grid: string[];
  /** Optional per-row dim flags (Connections mistake rows). */
  dim?: boolean[];
}

export function ResultGrid({ grid, dim }: ResultGridProps): JSX.Element {
  return (
    <div className={styles.grid} role="img" aria-label="result grid">
      {grid.map((line, i) => (
        <div key={i} className={[styles.gridRow, dim?.[i] ? styles.dim : ""].filter(Boolean).join(" ")}>
          {line}
        </div>
      ))}
    </div>
  );
}
