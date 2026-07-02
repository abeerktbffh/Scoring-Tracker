import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Flame icon (Streak indicator)
 * SVG path from approved mockup: icons-picker.html
 */
export const Flame = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

/**
 * Crown icon (Leader indicator)
 * SVG paths from approved mockup: icons-picker.html
 */
export const Crown = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" />
    <path d="M5 20h14" />
  </svg>
);

/**
 * Check icon (Solved indicator)
 * SVG path from approved mockup: icons-picker.html
 */
export const Check = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * AlertDot icon (Partial / close indicator)
 * SVG paths from approved mockup: icons-picker.html
 */
export const AlertDot = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    className={className}
  >
    <path d="M12 8v5" />
    <circle cx="12" cy="16.5" r=".6" fill="currentColor" />
  </svg>
);

/**
 * Trophy icon (Win indicator)
 * SVG paths from approved mockup: icons-picker.html
 */
export const Trophy = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

/**
 * Search icon
 * SVG paths from approved mockup: icons-picker.html
 */
export const Search = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className={className}
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" />
  </svg>
);

/**
 * Plus icon
 * Simple geometric glyph for adding/new items
 */
export const Plus = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * Chevron icon (right chevron for navigation)
 * Simple geometric glyph for list navigation
 */
export const Chevron = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/**
 * HomeIcon — Tab navigation
 * Simple house glyph
 */
export const HomeIcon = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12l9-9 9 9v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z" />
    <path d="M9 22v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
  </svg>
);

/**
 * BoardIcon — Tab navigation
 * Simple grid/board glyph
 */
export const BoardIcon = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);

/**
 * YouIcon — Tab navigation
 * Simple person/profile glyph
 */
export const YouIcon = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="7" r="3" />
    <path d="M12 11c-2.67 0-5.33 1.34-6.67 4v4h13.34v-4c-1.34-2.66-4-4-6.67-4z" />
  </svg>
);

/**
 * MenuIcon — Tab navigation
 * Simple hamburger/menu glyph
 */
export const MenuIcon = ({ size = 20, className }: IconProps): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);
