"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAllProposals,
  attoToTokens,
  shortenAddress,
  shortenUrl,
} from "@/lib/contract";
import type { Proposal } from "@/lib/contract";

/* ============================================================
   Status Badge
   ============================================================ */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:  "badge-pending",
    APPROVED: "badge-approved",
    REJECTED: "badge-rejected",
    FUNDED:   "badge-funded",
  };
  const dots: Record<string, string> = {
    PENDING:  "bg-amber-400",
    APPROVED: "bg-emerald-400",
    REJECTED: "bg-red-400",
    FUNDED:   "bg-violet-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${map[status] ?? "badge-pending"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] ?? "bg-amber-400"}`} />
      {status}
    </span>
  );
}

/* ============================================================
   Tier Badge
   ============================================================ */
function TierBadge({ tier }: { tier: string }) {
  if (!tier) return <span className="text-slate-700 font-mono text-xs">--</span>;
  const cfg: Record<string, { color: string; bg: string }> = {
    TIER_1: { color: "text-cyan-300",   bg: "bg-cyan-400/10 border-cyan-400/20" },
    TIER_2: { color: "text-violet-300", bg: "bg-violet-400/10 border-violet-400/20" },
    TIER_3: { color: "text-slate-400",  bg: "bg-slate-700/40 border-slate-600/30" },
  };
  const s = cfg[tier] ?? cfg.TIER_3;
  return (
    <span className={`px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${s.color} ${s.bg}`}>
      {tier}
    </span>
  );
}

/* ============================================================
   Empty State
   ============================================================ */
function EmptyState() {
  return (
    <div className="glass-glow rounded-xl flex flex-col items-center justify-center py-20 gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border border-slate-700 flex items-center justify-center bg-slate-900/60 animate-float">
          <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center">
          <span className="text-[9px] text-slate-600 font-mono">0</span>
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-slate-400 text-sm font-medium">No proposals on-chain yet</p>
        <p className="text-slate-600 text-xs">
          Submit a GitHub repository in the{" "}
          <span className="text-cyan-400/70">Submit Proposal</span> tab to get started.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Detail Panel
   ============================================================ */
function DetailPanel({
  proposal,
  onClose,
}: {
  proposal: Proposal;
  onClose: () => void;
}) {
  const fields = [
    { label: "GitHub URL",      value: proposal.github_url, isLink: true },
    { label: "Applicant",       value: proposal.applicant },
    { label: "Requested",       value: `${attoToTokens(proposal.requested_amount)} tokens` },
    { label: "Allocated",       value: proposal.allocated_amount ? `${attoToTokens(proposal.allocated_amount)} tokens` : "--" },
    { label: "Commit Bracket",  value: proposal.commit_bracket || "--" },
    { label: "Contributors",    value: proposal.contributor_bracket || "--" },
    { label: "Structural Quality", value: proposal.quality_bracket || "--" },
    { label: "License SPDX",    value: proposal.license_spdx || "--" },
    { label: "OSI Approved",    value: proposal.is_osi_approved || "--" },
    { label: "Audit Verified",  value: proposal.has_audit || "--" },
    { label: "Attestation UID", value: proposal.audit_uid || "--" },
    { label: "Decision",        value: proposal.evaluation_decision || "--" },
    { label: "Submitted At",    value: proposal.submitted_at || "--" },
  ];

  return (
    <div className="glass-glow rounded-xl border border-cyan-400/15 p-6 space-y-5 animate-fade-up">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="accent-bar" />
          <h3 className="text-sm font-semibold text-white">
            Proposal #{proposal.proposal_id}
          </h3>
          <StatusBadge status={proposal.status} />
          {proposal.tier && <TierBadge tier={proposal.tier} />}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:border-slate-500 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Fields grid */}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map(({ label, value, isLink }) => (
          <div key={label} className="glass-inset rounded-lg px-3 py-2.5 space-y-1">
            <dt className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">{label}</dt>
            {isLink ? (
              <dd className="text-xs font-mono text-cyan-400 break-all hover:text-cyan-300 transition-colors">
                <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>
              </dd>
            ) : (
              <dd className="text-xs font-mono text-slate-300 break-all">{value}</dd>
            )}
          </div>
        ))}
      </dl>

      {/* Reasoning */}
      {proposal.evaluation_reasoning && (
        <div className="glass-inset rounded-lg p-4 space-y-2">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">
            AI Reasoning
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {proposal.evaluation_reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Main Component
   ============================================================ */
export default function ProposalsTab() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<Proposal | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllProposals()
      .then(setProposals)
      .catch((e: Error) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="accent-bar" />
          <h2 className="text-base font-semibold text-white">All Proposals</h2>
          {!loading && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[11px]">
              {proposals.length}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg glass border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-cyan-400/20 transition-all text-[11px] font-mono disabled:opacity-40"
        >
          <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="glass-glow rounded-xl p-4 border border-red-500/20 text-red-400 font-mono text-xs flex items-start gap-3">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass rounded-xl h-14 shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}

      {!loading && !error && proposals.length === 0 && <EmptyState />}

      {!loading && proposals.length > 0 && (
        <div className="glass-glow rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {["ID", "GitHub Repo", "Applicant", "Requested", "Tier", "Status"].map((h, idx) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-[10px] font-mono text-slate-600 uppercase tracking-widest font-medium ${
                        idx === 3 ? "text-right" : idx >= 4 ? "text-center" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {proposals.map((p) => {
                  const isSelected = selected?.proposal_id === p.proposal_id;
                  return (
                    <tr
                      key={p.proposal_id}
                      onClick={() => setSelected(isSelected ? null : p)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-cyan-400/5 border-l-2 border-l-cyan-400/40"
                          : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                        #{p.proposal_id}
                      </td>
                      <td className="px-5 py-3.5">
                        <a
                          href={p.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          {shortenUrl(p.github_url)}
                        </a>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500">
                        {shortenAddress(p.applicant)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-300 text-right">
                        {attoToTokens(p.requested_amount)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <TierBadge tier={p.tier} />
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <DetailPanel proposal={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
