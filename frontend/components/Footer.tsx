"use client";

import { useState, useCallback } from "react";
import type { TabId } from "@/components/TabNav";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://studio.genlayer.com";

const SHORT = `${CONTRACT_ADDRESS.slice(0, 10)}...${CONTRACT_ADDRESS.slice(-8)}`;

interface FooterProps {
  onNavigate?: (tab: TabId) => void;
}

/* ============================================================
   External link icon
   ============================================================ */
function ExternalIcon() {
  return (
    <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

/* ============================================================
   Main component
   ============================================================ */
export default function Footer({ onNavigate }: FooterProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <footer className="relative border-t border-slate-800/50 overflow-hidden">
      {/* Top edge glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />

      {/* Background tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(34,211,238,0.03) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4">

        {/* ======================================================
            Top row: Brand + Nav columns
            ====================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 py-12 border-b border-slate-800/40">

          {/* Brand column */}
          <div className="md:col-span-2 space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg border border-cyan-400/30 bg-gradient-to-br from-cyan-400/15 to-indigo-500/10 flex items-center justify-center neon-border-cyan">
                <span className="font-mono font-bold text-sm gradient-text">LX</span>
              </div>
              <div>
                <h3 className="text-base font-extrabold gradient-text leading-none">LexiTreasury</h3>
                <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mt-0.5">
                  GenLayer Autonomous DAO
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              An intelligent treasury contract on GenLayer where funding decisions
              are made entirely by AI consensus evaluated against a natural-language
              DAO constitution. No multisig. No committees. Just code.
            </p>

            {/* Contract address copy pill */}
            <button
              onClick={copyAddress}
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full glass border border-slate-700/50 hover:border-cyan-400/25 transition-all group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0" />
              <span className="font-mono text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors">
                {SHORT}
              </span>
              <span className="font-mono text-[9px] text-slate-700 group-hover:text-cyan-400/60 transition-colors">
                {copied ? <span className="text-emerald-400">COPIED</span> : "COPY"}
              </span>
            </button>

            {/* Network badge */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Live on <span className="text-emerald-400">StudioNet</span>
                <span className="text-slate-700 ml-2">Chain 61999</span>
              </span>
            </div>
          </div>

          {/* Navigation column */}
          <div className="space-y-4">
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest font-semibold">
              Navigation
            </p>
            <nav className="space-y-2">
              {[
                { label: "Constitution & Overview", tab: "constitution" as TabId },
                { label: "Proposals & Audits",      tab: "proposals"   as TabId },
                { label: "Submit Proposal",          tab: "submit"      as TabId },
              ].map(({ label, tab }) => (
                <button
                  key={tab}
                  onClick={() => onNavigate?.(tab)}
                  className="block text-xs text-slate-500 hover:text-cyan-400 transition-colors duration-150 font-medium"
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Resources column */}
          <div className="space-y-4">
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest font-semibold">
              Resources
            </p>
            <nav className="space-y-2">
              {[
                { label: "GenLayer Studio",  href: "https://studio.genlayer.com" },
                { label: "GenLayer Docs",    href: "https://docs.genlayer.com" },
                { label: "Agent Tank",       href: "https://agenttank.xyz" },
                { label: "Contract Explorer",href: EXPLORER_URL },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors duration-150 font-medium"
                >
                  {label}
                  <ExternalIcon />
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* ======================================================
            Middle row: Contract metadata strip
            ====================================================== */}
        <div className="py-4 border-b border-slate-800/30">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              { label: "Contract",   value: SHORT,                                          mono: true },
              { label: "Network",    value: "StudioNet",                                    mono: true },
              { label: "Chain ID",   value: "61999",                                        mono: true },
              { label: "Deployer",   value: "lexitreasury_deployer",                        mono: true },
              { label: "Validators", value: "5 / 5 active",                                 mono: false },
              { label: "Consensus",  value: "100% (deploy)",                                mono: false },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-700 uppercase tracking-wider">
                  {label}
                </span>
                <span className={`text-[10px] ${mono ? "font-mono" : ""} text-slate-500`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ======================================================
            Bottom row: Copyright + links
            ====================================================== */}
        <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-700">
            <span>LexiTreasury</span>
            <span className="text-slate-800">&mdash;</span>
            <span>Agent Tank Hackathon 2026</span>
            <span className="text-slate-800">&mdash;</span>
            <span>MIT License</span>
          </div>

          {/* Right links */}
          <div className="flex items-center gap-4">
            {[
              { label: "Explorer",   href: EXPLORER_URL },
              { label: "GenLayer",   href: "https://genlayer.com" },
              { label: "Docs",       href: "https://docs.genlayer.com" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-slate-700 hover:text-cyan-400/70 transition-colors duration-150"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
