import React from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "amber" | "ghost";
}

export function Button({ variant = "primary", className, ...buttonProps }: ButtonProps): JSX.Element {
  const variantClass = variant === "amber" ? styles.amber : variant === "ghost" ? styles.ghost : styles.primary;
  return (
    <button
      className={[styles.button, variantClass, className].filter(Boolean).join(" ")}
      {...buttonProps}
    />
  );
}
