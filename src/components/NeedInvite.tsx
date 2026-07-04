"use client";
import React from "react";
import styles from "./NeedInvite.module.css";

export function NeedInvite(): JSX.Element {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.kicker}>Bragboard</p>
        <h1 className={styles.headline}>You&rsquo;ll need an invite.</h1>
        <p className={styles.sub}>Ask the group owner for an invite link.</p>
      </div>
    </div>
  );
}
