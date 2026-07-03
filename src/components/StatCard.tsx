import React from "react";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  value: React.ReactNode;
  label: React.ReactNode;
}

export function StatCard({ value, label }: StatCardProps): JSX.Element {
  return (
    <div className={styles.statCard}>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
