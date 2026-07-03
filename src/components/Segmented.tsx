import React from "react";
import styles from "./Segmented.module.css";

export interface SegmentedOption {
  k: string;
  label: string;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (k: string) => void;
}

export function Segmented({ options, value, onChange }: SegmentedProps): JSX.Element {
  return (
    <div className={styles.seg} role="group">
      {options.map((option) => {
        const active = value === option.k;
        return (
          <button
            key={option.k}
            type="button"
            className={[styles.option, active ? styles.active : ""].filter(Boolean).join(" ")}
            aria-pressed={active}
            onClick={() => onChange(option.k)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
