"use client";
import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getGames } from "@/lib/api";
import { useTheme } from "@/design/theme";
import { MenuIcon } from "@/design/icons";
import { SignInGate } from "./SignInGate";
import { NeedInvite } from "./NeedInvite";
import { Onboarding } from "./Onboarding";
import { TabBar } from "./TabBar";
import { Drawer } from "./Drawer";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: React.ReactNode;
}

interface OnboardingState {
  alreadyMember: boolean;
  needsInvite: boolean;
  migrationActive: boolean;
  unclaimed: { id: string; displayName: string }[];
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

async function redeemInvite(token: string): Promise<void> {
  try {
    await fetch("/api/invites/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Best-effort — the onboarding fetch that follows reflects real
    // eligibility regardless of whether redemption succeeded here.
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
    const invite = searchParams?.get("invite");

    (async () => {
      if (invite) {
        await redeemInvite(invite);
      }
      const state = await fetchOnboarding();
      if (cancelled) return;
      setOnboarding(state);
      setOnboardingChecked(true);
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately excludes searchParams from deps beyond the invite token
    // captured on the run that follows `authed` becoming true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function refreshOnboarding() {
    const state = await fetchOnboarding();
    setOnboarding(state);
  }

  async function handleClaim(playerId: string): Promise<boolean> {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", playerId }),
    });
    return res.ok;
  }

  async function handleCreate(displayName: string): Promise<boolean> {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", displayName }),
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
    if (onboarding.needsInvite) {
      return <NeedInvite />;
    }
    return (
      <Onboarding
        migrationActive={onboarding.migrationActive}
        unclaimed={onboarding.unclaimed}
        onClaim={handleClaim}
        onCreate={handleCreate}
      />
    );
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
