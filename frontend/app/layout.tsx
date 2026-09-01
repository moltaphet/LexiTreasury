import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexiTreasury — GenLayer DAO",
  description:
    "Autonomous treasury protocol governed by natural-language DAO constitutions on GenLayer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
