import React from "react";
import { Flame } from "@/design/icons";
import styles from "./StreakBadge.module.css";

export interface StreakBadgeProps {
  count: number;
}

export function StreakBadge({ count }: StreakBadgeProps): JSX.Element {
  if (count === 0) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <span className={styles.badge}>
      <Flame size={15} />
      {count}
    </span>
  );
}
