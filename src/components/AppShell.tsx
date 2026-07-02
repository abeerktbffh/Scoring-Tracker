"use client";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getGames } from "@/lib/api";
import { useTheme } from "@/design/theme";
import { MenuIcon } from "@/design/icons";
import { SignInGate } from "./SignInGate";
import { TabBar } from "./TabBar";
import { Drawer } from "./Drawer";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: React.ReactNode;
}

function activeFromPathname(pathname: string | null): string {
  if (!pathname || pathname === "/") return "home";
  if (pathname.startsWith("/standings")) return "standings";
  if (pathname.startsWith("/you")) return "you";
  return "";
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    getGames().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAuthed(true);
      } else if (result.status === 401) {
        setAuthed(false);
      } else {
        // Non-auth failures (network error, 5xx, etc.) don't imply a signed-out
        // state; avoid trapping the user behind the gate for transient errors.
        setAuthed(true);
      }
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) {
    return <></>;
  }

  if (!authed) {
    return <SignInGate onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon size={22} />
        </button>
      </header>

      <main className={styles.content}>{children}</main>

      <TabBar active={activeFromPathname(pathname)} />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  );
}
