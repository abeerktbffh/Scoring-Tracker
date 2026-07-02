import React from "react";
import styles from "./LockedState.module.css";

export interface LockedStateProps {
  children: React.ReactNode;
}

export function LockedState({ children }: LockedStateProps): JSX.Element {
  return <div className={styles.wrap}>{children}</div>;
}
