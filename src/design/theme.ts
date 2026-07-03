"use client";
import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";

export function resolveTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

// Runs before paint (inlined in <head>) to avoid a flash of the wrong theme.
export const THEME_PREPAINT = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=(s==='light'||s==='dark')?s:(d?'dark':'light');}catch(e){}})();`;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null);
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(resolveTheme(stored, sys));
  }, []);
  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  }, []);
  return { theme, setTheme };
}
