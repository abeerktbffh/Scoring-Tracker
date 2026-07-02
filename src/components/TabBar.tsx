import React from "react";
import Link from "next/link";
import { HomeIcon, BoardIcon, YouIcon, Plus } from "@/design/icons";
import styles from "./TabBar.module.css";

export interface TabBarProps {
  active: string;
}

export function TabBar({ active }: TabBarProps): JSX.Element {
  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link
        href="/"
        className={styles.item}
        aria-current={active === "home" ? "page" : undefined}
      >
        <HomeIcon size={20} />
        Home
      </Link>
      <Link
        href="/standings"
        className={styles.item}
        aria-current={active === "standings" ? "page" : undefined}
      >
        <BoardIcon size={20} />
        Standings
      </Link>
      <Link href="/log" className={styles.center} aria-label="Log a result">
        <Plus size={22} />
      </Link>
      <Link
        href="/you"
        className={styles.item}
        aria-current={active === "you" ? "page" : undefined}
      >
        <YouIcon size={20} />
        You
      </Link>
    </nav>
  );
}
