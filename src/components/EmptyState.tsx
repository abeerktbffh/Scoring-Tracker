import React from "react";
import { Button } from "./Button";
import styles from "./EmptyState.module.css";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title: string;
  body: string;
  action?: EmptyStateAction;
}

export function EmptyState({ title, body, action }: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.wrap}>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {action ? (
        <Button variant="primary" className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
