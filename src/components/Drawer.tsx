import React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Theme } from "@/design/theme";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  isSuperAdmin?: boolean;
}

export function Drawer({ open, onClose, theme, setTheme, isSuperAdmin }: DrawerProps): JSX.Element {
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
        {isSuperAdmin && (
          <div className={styles.section}>
            <Link href="/admin" className={styles.item} onClick={onClose}>
              Admin
            </Link>
          </div>
        )}

        <div className={styles.section}>
          <Link href="/setup" className={styles.item} onClick={onClose}>
            Set up auto-log
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

        <div className={styles.section}>
          <button
            type="button"
            className={styles.item}
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
