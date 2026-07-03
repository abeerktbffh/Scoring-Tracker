import React from "react";
import { Button } from "./Button";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <div className={styles.wrap}>
      <p className={styles.message}>{message}</p>
      <Button variant="ghost" className={styles.retry} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
