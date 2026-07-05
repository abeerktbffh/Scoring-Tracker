"use client";
import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getGames } from "@/lib/api";
import { useTheme, type Theme } from "@/design/theme";
import { MenuIcon } from "@/design/icons";
import { SignInGate } from "./SignInGate";
import { Onboarding } from "./Onboarding";
import { TabBar } from "./TabBar";
import { Drawer } from "./Drawer";
import { BoardProvider, useBoard } from "./BoardContext";
import { BoardSwitcher } from "./BoardSwitcher";
import { GroupOverflowMenu } from "./GroupOverflowMenu";
import { CreateGroup } from "./CreateGroup";
import { JoinGroup } from "./JoinGroup";
import { ManageGroup } from "./ManageGroup";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: React.ReactNode;
}

interface OnboardingState {
  alreadyMember: boolean;
}

function activeFromPathname(pathname: string | null): string {
  if (!pathname || pathname === "/") return "home";
  if (pathname.startsWith("/standings")) return "standings";
  if (pathname.startsWith("/you")) return "you";
  return "";
}

async function fetchOnboarding(): Promise<OnboardingState | null> {
  try {
    const res = await fetch("/api/onboarding");
    if (!res.ok) return null;
    return (await res.json()) as OnboardingState;
  } catch {
    return null;
  }
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: AppShellProps): JSX.Element {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    (async () => {
      const state = await fetchOnboarding();
      if (cancelled) return;
      setOnboarding(state);
      setOnboardingChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authed]);

  async function refreshOnboarding() {
    const state = await fetchOnboarding();
    setOnboarding(state);
  }

  async function handleCreate(displayName: string): Promise<boolean> {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (res.ok) {
      await refreshOnboarding();
    }
    return res.ok;
  }

  if (!checked) {
    return <></>;
  }

  if (!authed) {
    return <SignInGate onAuthed={() => setAuthed(true)} />;
  }

  if (!onboardingChecked) {
    return <></>;
  }

  if (onboarding && !onboarding.alreadyMember) {
    return <Onboarding onCreate={handleCreate} />;
  }

  return (
    <BoardProvider>
      <ShellContent
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        manageOpen={manageOpen}
        setManageOpen={setManageOpen}
        theme={theme}
        setTheme={setTheme}
        pathname={pathname}
      >
        {children}
      </ShellContent>
    </BoardProvider>
  );
}

interface ShellContentProps {
  children: React.ReactNode;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  manageOpen: boolean;
  setManageOpen: (open: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  pathname: string | null;
}

// Rendered inside BoardProvider so it (and the overlays it mounts) can call useBoard().
function ShellContent({
  children,
  drawerOpen,
  setDrawerOpen,
  createOpen,
  setCreateOpen,
  manageOpen,
  setManageOpen,
  theme,
  setTheme,
  pathname,
}: ShellContentProps): JSX.Element {
  const board = useBoard();
  const searchParams = useSearchParams();
  const joinToken = searchParams?.get("join") ?? null;
  const [joinDismissed, setJoinDismissed] = useState(false);

  function clearJoinParam(): void {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setJoinDismissed(true);
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

        <BoardSwitcher onNewGroup={() => setCreateOpen(true)} />

        <GroupOverflowMenu onManage={() => setManageOpen(true)} />
      </header>

      <main className={styles.content}>{children}</main>

      <TabBar active={activeFromPathname(pathname)} />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />

      <CreateGroup
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          board.refresh().then(() => board.select(id));
        }}
      />

      {manageOpen && board.board && (
        <ManageGroup
          groupId={board.board.id}
          onClose={() => setManageOpen(false)}
          onChanged={() => board.refresh()}
          onDeleted={() => {
            board.select(null);
            board.refresh();
            setManageOpen(false);
          }}
        />
      )}

      {joinToken && !joinDismissed && (
        <JoinGroup
          token={joinToken}
          onClose={clearJoinParam}
          onJoined={(groupId) => {
            board.refresh().then(() => board.select(groupId));
            clearJoinParam();
          }}
        />
      )}
    </div>
  );
}
