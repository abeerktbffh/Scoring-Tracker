import React from "react";
import styles from "./Chip.module.css";

export interface ChipProps {
  active?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}

export function Chip({ active = false, children, onClick }: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.active : ""].filter(Boolean).join(" ")}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
