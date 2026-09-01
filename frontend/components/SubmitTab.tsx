"use client";

import { useState } from "react";
import { submitProposal } from "@/lib/contract";
import { useWallet } from "@/contexts/WalletContext";
import { shortenAddress } from "@/lib/contract";

interface FormState {
  githubUrl: string;
  amount: string;
}

type SubmitStatus =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; txHash: string }
  | { type: "error"; message: string };

/* ============================================================
   Step indicator for the "How it works" panel
   ============================================================ */
const STEPS = [
  {
    n: "01",
    title: "Submit URL",
    desc: "Your GitHub repo URL and token request are written on-chain.",
    color: "text-cyan-400",
    border: "border-cyan-400/20",
    bg: "bg-cyan-400/8",
  },
  {
    n: "02",
    title: "Live Metrics Fetch",
    desc: "5 validators fetch commits, license, and security audit data from GitHub.",
    color: "text-sky-400",
    border: "border-sky-400/20",
    bg: "bg-sky-400/8",
  },
  {
    n: "03",
    title: "AI Consensus",
    desc: "Each validator runs an LLM against the DAO constitution. Majority rules.",
    color: "text-indigo-400",
    border: "border-indigo-400/20",
    bg: "bg-indigo-400/8",
  },
  {
    n: "04",
    title: "Outcome Written",
    desc: "APPROVED or REJECTED. If approved, a funding tier cap is assigned on-chain.",
    color: "text-violet-400",
    border: "border-violet-400/20",
    bg: "bg-violet-400/8",
  },
];

export default function SubmitTab({
  onProposalSubmitted,
}: {
  onProposalSubmitted?: () => void;
}) {
  const wallet = useWallet();

  const [form, setForm]     = useState<FormState>({ githubUrl: "", amount: "" });
  const [status, setStatus] = useState<SubmitStatus>({ type: "idle" });

  function setField(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function validate(): string | null {
    if (!form.githubUrl.startsWith("https://github.com/"))
      return "GitHub URL must start with https://github.com/";
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0)
      return "Requested amount must be a positive number";
    if (!wallet.isConnected)
      return "Please connect your wallet before submitting";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setStatus({ type: "error", message: err }); return; }

    setStatus({ type: "submitting" });
    try {
      const txHash = await submitProposal(
        form.githubUrl,
        parseFloat(form.amount),
        wallet.address!
      );
      setStatus({ type: "success", txHash });
      setForm({ githubUrl: "", amount: "" });
      onProposalSubmitted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setStatus({ type: "error", message: msg });
    }
  }

  const isSubmitting = status.type === "submitting";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

      {/* ======================================================
          Left: How it works
          ====================================================== */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">How It Works</h2>
        </div>

        <div className="space-y-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className={`glass-glow rounded-xl p-4 flex gap-4 items-start border ${step.border}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold shrink-0 ${step.bg} ${step.color} border ${step.border}`}>
                {step.n}
              </div>
              <div>
                <p className={`text-sm font-semibold ${step.color}`}>{step.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tier reference */}
        <div className="glass-inset rounded-xl p-4 mt-2">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-3">
            Tier Caps Reference
          </p>
          <div className="space-y-2">
            {[
              { t: "TIER_1", cap: "10,000", color: "text-cyan-400",   bar: "bg-cyan-400" },
              { t: "TIER_2", cap:  "5,000", color: "text-violet-400", bar: "bg-violet-400" },
              { t: "TIER_3", cap:  "1,000", color: "text-slate-400",  bar: "bg-slate-500" },
            ].map(({ t, cap, color, bar }) => (
              <div key={t} className="flex items-center gap-3">
                <span className={`text-[10px] font-mono font-semibold w-14 ${color}`}>{t}</span>
                <div className="flex-1 h-1 rounded-full bg-slate-800">
                  <div
                    className={`h-1 rounded-full ${bar}`}
                    style={{
                      width: t === "TIER_1" ? "100%" : t === "TIER_2" ? "50%" : "10%",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500 w-16 text-right">
                  {cap} tkns
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======================================================
          Right: Form
          ====================================================== */}
      <div className="lg:col-span-3">
        <div className="flex items-center gap-3 mb-6">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">Submit Proposal</h2>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* GitHub URL */}
          <div>
            <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
              <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              GitHub Repository URL
            </label>
            <input
              type="url"
              value={form.githubUrl}
              onChange={setField("githubUrl")}
              placeholder="https://github.com/owner/repo"
              disabled={isSubmitting}
              className="cyber-input w-full px-4 py-3 rounded-xl glass border border-slate-700/60 text-slate-100 font-mono text-sm placeholder-slate-700 disabled:opacity-50"
              required
            />
          </div>

          {/* Amount */}
          <div>
            <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
              <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Requested Amount
              <span className="text-slate-700 normal-case tracking-normal">
                (tokens, max depends on tier)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={setField("amount")}
                placeholder="1000"
                disabled={isSubmitting}
                className="cyber-input w-full px-4 py-3 pr-20 rounded-xl glass border border-slate-700/60 text-slate-100 font-mono text-sm placeholder-slate-700 disabled:opacity-50"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-600">
                TOKENS
              </span>
            </div>
          </div>

          {/* Wallet status */}
          {wallet.isConnected && wallet.address ? (
            <div className="glass-inset rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-glow-pulse" />
              <div>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-0.5">
                  Signing as
                </p>
                <p className="text-[11px] font-mono text-emerald-400">
                  {shortenAddress(wallet.address)}
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-inset rounded-xl px-4 py-3 flex items-center gap-3 border border-amber-400/10">
              <svg className="w-4 h-4 text-amber-400/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-[11px] font-mono text-slate-600">
                Connect your wallet (top-right) before submitting.
              </p>
            </div>
          )}

          {/* ---- Status alerts ---- */}
          {status.type === "error" && (
            <div className="glass rounded-xl p-4 border border-red-500/20 bg-red-500/5 flex items-start gap-3 animate-fade-up">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-red-300 mb-0.5">Validation Error</p>
                <p className="text-xs text-red-400/80 font-mono">{status.message}</p>
              </div>
            </div>
          )}

          {status.type === "success" && (
            <div className="glass rounded-xl p-5 border border-emerald-500/20 bg-emerald-500/5 space-y-3 animate-fade-up">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-300">
                    Proposal Submitted
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Validators are now evaluating your project against the constitution.
                  </p>
                </div>
              </div>
              <div className="glass-inset rounded-lg p-3">
                <p className="text-[10px] font-mono text-slate-600 mb-1 uppercase tracking-wider">
                  Transaction Hash
                </p>
                <p className="text-[11px] font-mono text-emerald-300 break-all">
                  {status.txHash}
                </p>
              </div>
              <p className="text-[10px] text-slate-600">
                Check the Proposals tab in ~30 seconds for the evaluation result.
              </p>
            </div>
          )}

          {/* ---- Submit button ---- */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="glow-btn w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                Submitting to StudioNet...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Submit to GenLayer
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
