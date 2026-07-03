"use client";
import { useEffect } from "react";

/**
 * Registers the offline app-shell service worker (public/sw.js) once the
 * page has loaded. Renders nothing — this is a side-effect-only component.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
