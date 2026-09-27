import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexiTreasury — Milestone grants for open source",
  description:
    "Fund open-source work in fixed milestones, verify commit-pinned evidence and release each tranche through GenLayer consensus.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
