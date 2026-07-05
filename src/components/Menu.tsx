"use client";

import React, { useEffect } from "react";
import styles from "./Menu.module.css";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Menu({ open, onClose, title, children }: MenuProps): JSX.Element {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={[styles.backdrop, open ? styles.backdropOpen : ""].filter(Boolean).join(" ")}
        data-testid="menu-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[styles.panel, open ? styles.panelOpen : ""].filter(Boolean).join(" ")}
        data-testid="menu-panel"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        {title ? <p className={styles.title}>{title}</p> : null}
        {children}
      </div>
    </>
  );
}

export interface MenuItemProps {
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}

export function MenuItem({ onClick, icon, danger, children }: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      className={[styles.item, danger ? styles.danger : ""].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

export interface MenuLabelProps {
  children: React.ReactNode;
}

export function MenuLabel({ children }: MenuLabelProps): JSX.Element {
  return <p className={styles.sectionLabel}>{children}</p>;
}
