import React from "react";
import Link from "next/link";
import type { Theme } from "@/design/theme";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export function Drawer({ open, onClose, theme, setTheme }: DrawerProps): JSX.Element {
  const nextTheme: Theme = theme === "light" ? "dark" : "light";

  return (
    <>
      <div
        className={[styles.backdrop, open ? styles.backdropOpen : ""].filter(Boolean).join(" ")}
        data-testid="drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[styles.panel, open ? styles.panelOpen : ""].filter(Boolean).join(" ")}
        data-testid="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className={styles.section}>
          <button type="button" className={styles.item} disabled>
            Group
            <span className={styles.badge}>Coming soon</span>
          </button>
          <Link href="/admin" className={styles.item} onClick={onClose}>
            Admin
          </Link>
        </div>

        <div className={styles.section}>
          <p className={styles.heading}>Settings</p>
          <button
            type="button"
            className={styles.item}
            aria-label="Toggle theme"
            onClick={() => setTheme(nextTheme)}
          >
            Theme
            <span className={styles.themeToggle}>{theme === "light" ? "☀" : "☾"}</span>
          </button>
          <button type="button" className={styles.item}>
            Help / About
          </button>
        </div>

        <button type="button" className={[styles.item, styles.signOut].join(" ")}>
          Sign out
        </button>
      </div>
    </>
  );
}
