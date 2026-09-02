"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";
import { shortenAddress } from "@/lib/contract";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://studio.genlayer.com";
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf";

const SHORT_ADDR = `${CONTRACT_ADDRESS.slice(0, 8)}...${CONTRACT_ADDRESS.slice(-6)}`;

const VALIDATORS = [0, 1, 2, 3, 4];
const STAGGER = ["0ms", "200ms", "400ms", "600ms", "800ms"];

/* ============================================================
   Connect / Wallet panel (dropdown)
   ============================================================ */
function ConnectPanel({ onClose }: { onClose: () => void }) {
  const { connect, isConnected, address, disconnect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      await connect();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setIsConnecting(false);
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

  const noWallet = typeof window !== "undefined" && !window.ethereum;

  return (
    <div className="absolute right-0 top-full mt-2 w-72 z-50 glass-glow rounded-xl p-5 border border-slate-700/50 shadow-xl animate-fade-up">
      <p className="text-sm font-semibold text-slate-200 mb-1">Connect Wallet</p>
      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
        Connect via MetaMask or any EIP-1193 wallet. You will be prompted to switch to GenLayer StudioNet.
      </p>

      {error && (
        <p className="text-[11px] text-red-400 mb-3 font-mono leading-relaxed">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConnect}
          disabled={isConnecting}
          className="flex-1 glow-btn py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Connect MetaMask
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-slate-700/60 text-slate-500 text-xs font-mono hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>

      {noWallet && (
        <p className="mt-3 text-[10px] text-amber-400/80 font-mono leading-relaxed">
          No wallet detected. Install MetaMask or Rabby to continue.
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Main Header
   ============================================================ */
export default function Header() {
  const { isConnected, address, isHydrated } = useWallet();
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
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border border-cyan-400/30 overflow-hidden neon-border-cyan group-hover:border-cyan-400/55 transition-colors duration-200">
              <Image
                src="/assets/logo.jpeg"
                alt="LexiTreasury"
                width={40}
                height={40}
                className="w-full h-full object-cover"
                priority
              />
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
        </Link>

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

          {/* Wallet Connect Button -- hidden during the localStorage hydration frame
              to prevent a flash from "Connect Wallet" -> connected address */}
          <div
            className="relative transition-opacity duration-150"
            style={{ opacity: isHydrated ? 1 : 0, pointerEvents: isHydrated ? "auto" : "none" }}
            ref={panelRef}
          >
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
