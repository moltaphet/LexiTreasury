"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { shortenAddress } from "@/lib/contract";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://studio.genlayer.com";
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4";

const SHORT_ADDR = `${CONTRACT_ADDRESS.slice(0, 8)}...${CONTRACT_ADDRESS.slice(-6)}`;

const VALIDATORS = [0, 1, 2, 3, 4];
const STAGGER = ["0ms", "200ms", "400ms", "600ms", "800ms"];

/* ============================================================
   Connect / Wallet panel (dropdown)
   ============================================================ */
function ConnectPanel({ onClose }: { onClose: () => void }) {
  const { connect, isConnected, address, disconnect } = useWallet();
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = connect(keyInput.trim());
    if ("error" in result) {
      setError(result.error);
    } else {
      setKeyInput("");
      onClose();
    }
  }

  if (isConnected && address) {
    return (
      <div className="absolute right-0 top-full mt-2 w-72 z-50 glass-glow rounded-xl p-4 border border-slate-700/50 shadow-xl animate-fade-up">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3">
          Connected Account
        </p>
        <div className="glass-inset rounded-lg px-3 py-2.5 mb-3">
          <p className="text-[11px] font-mono text-cyan-400 break-all">{address}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          StudioNet (Chain 61999)
        </div>
        <button
          onClick={() => { disconnect(); onClose(); }}
          className="w-full py-2 rounded-lg border border-red-400/20 bg-red-400/5 text-red-400 text-xs font-mono font-medium hover:bg-red-400/10 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleConnect}
      className="absolute right-0 top-full mt-2 w-80 z-50 glass-glow rounded-xl p-5 border border-slate-700/50 shadow-xl animate-fade-up"
    >
      <p className="text-sm font-semibold text-slate-200 mb-1">Connect StudioNet Account</p>
      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
        Enter your GenLayer StudioNet private key. Used client-side only — never stored or transmitted.
      </p>

      <div className="relative mb-3">
        <input
          type={showKey ? "text" : "password"}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="0x..."
          autoComplete="off"
          spellCheck={false}
          className="cyber-input w-full px-3 py-2.5 pr-10 rounded-lg glass border border-slate-700/60 text-slate-200 font-mono text-xs placeholder-slate-700"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowKey((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
        >
          {showKey ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-red-400 mb-3 font-mono">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 glow-btn py-2 rounded-lg text-xs font-bold"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-slate-700/60 text-slate-500 text-xs font-mono hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ============================================================
   Main Header
   ============================================================ */
export default function Header() {
  const { isConnected, address } = useWallet();
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  useEffect(() => {
    if (!showPanel) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPanel]);

  return (
    <header className="sticky top-0 z-50 relative overflow-visible">
      {/* Glassmorphism backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" />
      {/* Top edge glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      {/* Subtle scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 50%, rgba(34,211,238,0.012) 50%)",
          backgroundSize: "100% 4px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* ---- Brand ---- */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg border border-cyan-400/30 bg-gradient-to-br from-cyan-400/15 to-indigo-500/10 flex items-center justify-center neon-border-cyan">
              <span className="font-mono font-bold text-sm gradient-text tracking-tight">
                LX
              </span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-glow-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight leading-none">
              <span className="gradient-text">LexiTreasury</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">
              GenLayer Autonomous DAO
            </p>
          </div>
        </div>

        {/* ---- Center: Contract Address Pill ---- */}
        <button
          onClick={copyAddress}
          title={`Copy: ${CONTRACT_ADDRESS}`}
          className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full glass border border-slate-700/50 hover:border-cyan-400/30 transition-all group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 shrink-0" />
          <span className="font-mono text-[11px] text-slate-400 group-hover:text-slate-200 transition-colors tracking-wide">
            {SHORT_ADDR}
          </span>
          <span className="text-[10px] font-mono text-slate-600 group-hover:text-cyan-400/70 transition-colors ml-0.5">
            {copied ? (
              <span className="text-emerald-400">COPIED</span>
            ) : (
              "COPY"
            )}
          </span>
        </button>

        {/* ---- Right cluster ---- */}
        <div className="flex items-center gap-3">
          {/* 5 Validator Nodes */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-slate-700/50">
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mr-1">
              Validators
            </span>
            {VALIDATORS.map((i) => (
              <div key={i} className="relative flex items-center justify-center w-3 h-3">
                <span
                  className="absolute w-3 h-3 rounded-full bg-emerald-400/20 animate-ping-slow"
                  style={{ animationDelay: STAGGER[i] }}
                />
                <span
                  className="relative w-2 h-2 rounded-full bg-emerald-400 animate-glow-pulse"
                  style={{ animationDelay: STAGGER[i] }}
                />
              </div>
            ))}
            <span className="ml-1 text-[10px] font-mono text-emerald-400/70">
              5/5
            </span>
          </div>

          {/* StudioNet badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-slate-700/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[11px] font-mono text-slate-300">StudioNet</span>
            <span className="text-[10px] font-mono text-slate-600 border-l border-slate-700 pl-2">
              61999
            </span>
          </div>

          {/* Wallet Connect Button */}
          <div className="relative" ref={panelRef}>
            {isConnected && address ? (
              <button
                onClick={() => setShowPanel((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/8 hover:bg-emerald-400/12 transition-all group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-mono text-[11px] text-emerald-400 tracking-wide">
                  {shortenAddress(address)}
                </span>
                <svg className="w-2.5 h-2.5 text-emerald-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => setShowPanel((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/8 hover:bg-cyan-400/14 hover:border-cyan-400/40 transition-all text-cyan-400 text-[11px] font-mono font-semibold"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Connect Wallet
              </button>
            )}

            {showPanel && (
              <ConnectPanel onClose={() => setShowPanel(false)} />
            )}
          </div>

          {/* Explorer link */}
          <a
            href={EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-cyan-400 hover:bg-cyan-400/12 hover:border-cyan-400/40 hover:shadow-[0_0_12px_rgba(34,211,238,0.15)] transition-all text-[11px] font-mono font-medium"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Explorer
          </a>
        </div>
      </div>
    </header>
  );
}
