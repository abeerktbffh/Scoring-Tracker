import "./globals.css";
import "@/design/tokens.css";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { THEME_PREPAINT } from "@/design/theme";

const display = Fraunces({ subsets: ["latin"], weight: ["400","600"], variable: "--font-display", display: "swap" });
const ui = Inter({ subsets: ["latin"], weight: ["400","600","700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = { title: "Bragboard", description: "Your group's daily puzzle standings." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT }} /></head>
      <body>{children}</body>
    </html>
  );
}
