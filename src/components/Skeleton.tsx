import React from "react";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
}

export function Skeleton({ w = "100%", h = 16, radius = 4 }: SkeletonProps): JSX.Element {
  return (
    <span
      className={styles.skeleton}
      style={{ width: w, height: h, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
