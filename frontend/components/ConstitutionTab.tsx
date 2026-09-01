"use client";

import { useEffect, useState } from "react";
import { fetchConstitution, fetchTierCaps, attoToTokens } from "@/lib/contract";
import type { TierCaps } from "@/lib/contract";

/* ============================================================
   Tier Card
   ============================================================ */
interface TierCardProps {
  label: string;
  rank: string;
  cap: string;
  description: string;
  requirements: string[];
  accent: { border: string; glow: string; badge: string; dot: string };
}

function TierCard({ label, rank, cap, description, requirements, accent }: TierCardProps) {
  return (
    <div
      className={`glass-glow rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden group ${accent.border}`}
      style={{ boxShadow: `0 0 24px ${accent.glow}` }}
    >
      {/* Corner glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 opacity-10 rounded-bl-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent.dot}, transparent 70%)` }}
      />
      {/* Top edge accent */}
      <div className="absolute top-0 left-6 right-6 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accent.dot}, transparent)` }}
      />

      <div className="flex items-start justify-between">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase ${accent.badge}`}
        >
          {label}
        </span>
        <span className="text-[10px] font-mono text-slate-600">{rank}</span>
      </div>

      <div>
        <p className="text-2xl font-bold font-mono text-white">
          {attoToTokens(cap)}
          <span className="text-sm text-slate-500 font-normal ml-1.5">tokens max</span>
        </p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
      </div>

      <ul className="space-y-1 mt-auto pt-2 border-t border-slate-800/60">
        {requirements.map((r) => (
          <li key={r} className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: accent.dot }} />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   AI Consensus Workflow Diagram
   ============================================================ */
const FLOW_STEPS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    label: "GitHub Repo",
    sub: "URL submitted on-chain",
    color: "border-cyan-400/30 text-cyan-400",
    bg: "bg-cyan-400/8",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    label: "Non-Det Fetch",
    sub: "Live API: commits, license, audits",
    color: "border-sky-400/30 text-sky-400",
    bg: "bg-sky-400/8",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
    label: "AI Consensus",
    sub: "5 validators run LLM evaluation",
    color: "border-indigo-400/30 text-indigo-400",
    bg: "bg-indigo-400/8",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Binary Outcome",
    sub: "APPROVED / REJECTED + Tier",
    color: "border-violet-400/30 text-violet-400",
    bg: "bg-violet-400/8",
  },
];

function WorkflowDiagram() {
  return (
    <div className="glass-glow rounded-xl p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

      <div className="flex items-center gap-3 mb-6">
        <div className="accent-bar" />
        <h2 className="text-base font-semibold text-white">AI Consensus Workflow</h2>
        <span className="ml-auto text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          GenLayer GenVM
        </span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-0">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center flex-1 min-w-0">
            {/* Step box */}
            <div className={`flex-1 min-w-0 flex flex-col items-center gap-2 p-3 rounded-lg border ${step.bg} ${step.color} group`}>
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${step.color} ${step.bg} group-hover:scale-110 transition-transform duration-200`}>
                {step.icon}
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-white/90 leading-tight">{step.label}</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5 hidden md:block">{step.sub}</p>
              </div>
              <span className="text-[9px] font-mono text-slate-700">STEP {i + 1}</span>
            </div>
            {/* Connector arrow */}
            {i < FLOW_STEPS.length - 1 && (
              <div className="flex items-center mx-1 shrink-0">
                <div className="w-4 md:w-8 h-px bg-gradient-to-r from-cyan-400/30 to-indigo-400/30" />
                <svg className="w-3 h-3 text-slate-600 -ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom legend */}
      <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-wrap gap-4 text-[10px] font-mono">
        {[
          { dot: "#22d3ee", label: "Deterministic (pure Python)" },
          { dot: "#818cf8", label: "Non-deterministic (LLM / HTTP)" },
          { dot: "#4ade80", label: "Consensus-validated result" },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-2 text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Skeleton loader
   ============================================================ */
function SkeletonBlock({ h = "h-24" }: { h?: string }) {
  return (
    <div className={`glass rounded-xl ${h} shimmer animate-pulse`} />
  );
}

/* ============================================================
   Main component
   ============================================================ */
export default function ConstitutionTab() {
  const [constitution, setConstitution] = useState<string | null>(null);
  const [tierCaps, setTierCaps] = useState<TierCaps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchConstitution(), fetchTierCaps()])
      .then(([c, t]) => {
        if (cancelled) return;
        setConstitution(c);
        setTierCaps(t);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message ?? "Failed to load contract data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonBlock h="h-16" />
        <SkeletonBlock h="h-48" />
        <div className="grid grid-cols-3 gap-4">
          <SkeletonBlock h="h-36" />
          <SkeletonBlock h="h-36" />
          <SkeletonBlock h="h-36" />
        </div>
        <SkeletonBlock h="h-40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-glow rounded-xl p-6 border border-red-500/20 text-red-400 font-mono text-sm flex items-start gap-3">
        <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-semibold text-red-300 mb-1">RPC Error</p>
          <p className="text-xs text-red-400/80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Workflow diagram */}
      <WorkflowDiagram />

      {/* Constitution */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">DAO Constitution</h2>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-400/10 border border-cyan-400/15 text-cyan-400/70 text-[10px] font-mono">
            on-chain
          </span>
        </div>
        <div className="glass-glow rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
          {/* Faint corner hex decoration */}
          <div className="absolute bottom-0 right-0 w-32 h-32 opacity-[0.03] pointer-events-none">
            <svg viewBox="0 0 100 100" fill="none">
              <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z"
                stroke="#22d3ee" strokeWidth="1" fill="none" />
            </svg>
          </div>
          <p className="text-slate-300 leading-7 text-sm relative z-10">
            {constitution}
          </p>
        </div>
      </section>

      {/* Tier caps */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">Funding Tier Caps</h2>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-400/10 border border-indigo-400/15 text-indigo-300/70 text-[10px] font-mono">
            deterministic
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TierCard
            label="TIER 1"
            rank="01 / TOP"
            cap={tierCaps?.TIER_1 ?? "0"}
            description="Highest allocation. Institutional-grade open-source projects."
            requirements={[
              "MATURE or VETERAN commits",
              "OSI-approved license",
              "On-chain verified audit",
              "STANDARD+ structural quality",
              "Real multi-contributor team",
            ]}
            accent={{
              border: "border-cyan-400/20",
              glow: "rgba(34,211,238,0.04)",
              badge: "bg-cyan-400/15 text-cyan-300 border border-cyan-400/20",
              dot: "#22d3ee",
            }}
          />
          <TierCard
            label="TIER 2"
            rank="02 / MID"
            cap={tierCaps?.TIER_2 ?? "0"}
            description="Mid-range allocation. Active projects meeting core standards."
            requirements={[
              "ACTIVE or better commits",
              "OSI license OR verified audit",
            ]}
            accent={{
              border: "border-violet-400/20",
              glow: "rgba(129,140,248,0.04)",
              badge: "bg-violet-400/15 text-violet-300 border border-violet-400/20",
              dot: "#818cf8",
            }}
          />
          <TierCard
            label="TIER 3"
            rank="03 / BASE"
            cap={tierCaps?.TIER_3 ?? "0"}
            description="Entry allocation. Any licensed project with minimal activity."
            requirements={[
              "MINIMAL or better commits",
              "BASIC+ structural quality",
            ]}
            accent={{
              border: "border-slate-600/40",
              glow: "rgba(100,116,139,0.03)",
              badge: "bg-slate-700/50 text-slate-400 border border-slate-600/40",
              dot: "#64748b",
            }}
          />
        </div>
      </section>

      {/* Commit bracket table */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">Commit Activity Brackets</h2>
        </div>
        <div className="glass-glow rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/70">
                <th className="text-left px-5 py-3.5 text-slate-500 font-mono font-medium text-[10px] tracking-widest uppercase">
                  Bracket
                </th>
                <th className="text-left px-5 py-3.5 text-slate-500 font-mono font-medium text-[10px] tracking-widest uppercase">
                  Commit Range
                </th>
                <th className="text-left px-5 py-3.5 text-slate-500 font-mono font-medium text-[10px] tracking-widest uppercase">
                  Eligible Tiers
                </th>
                <th className="text-left px-5 py-3.5 text-slate-500 font-mono font-medium text-[10px] tracking-widest uppercase hidden md:table-cell">
                  Strength
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {[
                { bracket: "VETERAN",  range: "500+",      eligible: "TIER_1 / TIER_2 / TIER_3", pct: 100, color: "#22d3ee" },
                { bracket: "MATURE",   range: "100 - 499", eligible: "TIER_1 / TIER_2 / TIER_3", pct: 80,  color: "#38bdf8" },
                { bracket: "ACTIVE",   range: "10 - 99",   eligible: "TIER_2 / TIER_3",           pct: 55,  color: "#818cf8" },
                { bracket: "MINIMAL",  range: "1 - 9",     eligible: "TIER_3 only",               pct: 25,  color: "#64748b" },
                { bracket: "NONE",     range: "0",         eligible: "No allocation",              pct: 0,   color: "#f87171" },
              ].map((row) => (
                <tr key={row.bracket} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs font-bold"
                    style={{ color: row.color }}>
                    {row.bracket}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                    {row.range}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">
                    {row.eligible}
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-slate-800">
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{ width: `${row.pct}%`, background: row.color, boxShadow: `0 0 6px ${row.color}` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono w-8 text-right"
                        style={{ color: row.color }}>
                        {row.pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
