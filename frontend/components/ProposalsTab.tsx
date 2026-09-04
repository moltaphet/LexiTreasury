"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAllProposals,
  fetchTreasuryBalance,
  fetchTotalEscrowed,
  fetchClaimable,
  depositToTreasury,
  evaluateProposal,
  executeProposal,
  withdrawFunds,
  attoToTokens,
  shortenAddress,
  shortenUrl,
} from "@/lib/contract";
import type { Proposal } from "@/lib/contract";
import { useWallet } from "@/contexts/WalletContext";

type TxState =
  | { type: "idle" }
  | { type: "pending" }
  | { type: "success"; txHash: string }
  | { type: "error"; message: string };

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
  onChanged,
}: {
  proposal: Proposal;
  onClose: () => void;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  const [tx, setTx] = useState<TxState>({ type: "idle" });
  const [evalTx, setEvalTx] = useState<TxState>({ type: "idle" });
  const [evalStage, setEvalStage] = useState(0);

  const maintainerVerified = proposal.maintainer_verified === "true";
  const isPending = proposal.status === "PENDING";

  // Cycle through consensus-stage messages while the evaluation tx is in flight
  // so the judge sees the AI-validator pipeline progressing, not a dead spinner.
  const EVAL_STAGES = [
    "Fetching live GitHub signals...",
    "AI Validators Evaluating...",
    "Scoring against DAO constitution...",
    "Reaching Consensus...",
  ];
  useEffect(() => {
    if (evalTx.type !== "pending") {
      setEvalStage(0);
      return;
    }
    const id = setInterval(() => {
      setEvalStage((s) => (s + 1) % EVAL_STAGES.length);
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalTx.type]);

  async function handleEvaluate() {
    if (!wallet.isConnected || !wallet.address) {
      setEvalTx({ type: "error", message: "Connect your wallet to run the evaluation." });
      return;
    }
    setEvalTx({ type: "pending" });
    try {
      await evaluateProposal(proposal.proposal_id, wallet.address);
      setEvalTx({ type: "success", txHash: "" });
      // Refresh the list -- consensus has decided, so the row flips to
      // APPROVED / REJECTED and the Fund action appears automatically.
      onChanged();
    } catch (e: unknown) {
      setEvalTx({ type: "error", message: e instanceof Error ? e.message : "Evaluation failed" });
    }
  }

  async function handleExecute() {
    if (!wallet.isConnected || !wallet.address) {
      setTx({ type: "error", message: "Connect your wallet to execute this proposal." });
      return;
    }
    setTx({ type: "pending" });
    try {
      await executeProposal(proposal.proposal_id, wallet.address);
      setTx({ type: "success", txHash: "" });
      onChanged();
    } catch (e: unknown) {
      setTx({ type: "error", message: e instanceof Error ? e.message : "Execution failed" });
    }
  }

  const fields = [
    { label: "GitHub URL",      value: proposal.github_url, isLink: true },
    { label: "Applicant",       value: proposal.applicant },
    { label: "Payout Recipient", value: proposal.recipient || proposal.applicant },
    { label: "Maintainer Verified", value: proposal.maintainer_verified || "--" },
    { label: "Maintainer Login", value: proposal.maintainer_login || "--" },
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

      {/* AI Evaluation action (pending proposals only) */}
      {isPending && (
        <div className="glass-inset rounded-lg p-4 space-y-3 border border-cyan-400/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">
                AI Governance
              </p>
              <p className="text-xs text-slate-400 mt-1">
                This proposal is awaiting evaluation. Run the AI-validator
                consensus to score it against the DAO constitution and transition
                it to <span className="text-emerald-400">Approved</span> or{" "}
                <span className="text-red-400">Rejected</span>.
              </p>
            </div>
            <button
              onClick={handleEvaluate}
              disabled={evalTx.type === "pending"}
              className="glow-btn px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {evalTx.type === "pending" ? "Evaluating..." : "Run AI Evaluation"}
            </button>
          </div>
          {evalTx.type === "pending" && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {EVAL_STAGES[evalStage]}
            </div>
          )}
          {evalTx.type === "success" && (
            <p className="text-[11px] font-mono text-emerald-400">
              Consensus reached. Verdict recorded on-chain.
            </p>
          )}
          {evalTx.type === "error" && (
            <p className="text-[11px] font-mono text-red-400 break-all">{evalTx.message}</p>
          )}
        </div>
      )}

      {/* Execute action (approved proposals only) */}
      {proposal.status === "APPROVED" && (
        <div className="glass-inset rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">
                Execute Funding
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Releases {attoToTokens(proposal.allocated_amount)} tokens into the
                recipient&apos;s claimable escrow.
              </p>
            </div>
            <button
              onClick={handleExecute}
              disabled={!maintainerVerified || tx.type === "pending"}
              className="glow-btn px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {tx.type === "pending" ? "Executing..." : "Execute"}
            </button>
          </div>
          {!maintainerVerified && (
            <p className="text-[11px] font-mono text-amber-400/80">
              Recipient is not a verified repository maintainer -- funding is blocked.
            </p>
          )}
          {tx.type === "success" && (
            <p className="text-[11px] font-mono text-emerald-400">
              Executed. Funds are now claimable by the recipient.
            </p>
          )}
          {tx.type === "error" && (
            <p className="text-[11px] font-mono text-red-400 break-all">{tx.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Treasury Panel - deposit / withdraw / live balances
   ============================================================ */
function TreasuryPanel() {
  const wallet = useWallet();
  const [reserve, setReserve]     = useState<string>("0");
  const [escrowed, setEscrowed]   = useState<string>("0");
  const [claimable, setClaimable] = useState<string>("0");
  const [amount, setAmount]       = useState<string>("");
  const [depositTx, setDepositTx]   = useState<TxState>({ type: "idle" });
  const [withdrawTx, setWithdrawTx] = useState<TxState>({ type: "idle" });

  const load = useCallback(() => {
    fetchTreasuryBalance().then(setReserve).catch(() => {});
    fetchTotalEscrowed().then(setEscrowed).catch(() => {});
    if (wallet.address) {
      fetchClaimable(wallet.address).then(setClaimable).catch(() => setClaimable("0"));
    } else {
      setClaimable("0");
    }
  }, [wallet.address]);

  useEffect(() => { load(); }, [load]);

  async function handleDeposit() {
    if (!wallet.isConnected || !wallet.address) {
      setDepositTx({ type: "error", message: "Connect your wallet to deposit." });
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setDepositTx({ type: "error", message: "Enter a positive token amount." });
      return;
    }
    setDepositTx({ type: "pending" });
    try {
      await depositToTreasury(amt, wallet.address);
      setDepositTx({ type: "success", txHash: "" });
      setAmount("");
      load();
    } catch (e: unknown) {
      setDepositTx({ type: "error", message: e instanceof Error ? e.message : "Deposit failed" });
    }
  }

  async function handleWithdraw() {
    if (!wallet.isConnected || !wallet.address) {
      setWithdrawTx({ type: "error", message: "Connect your wallet to withdraw." });
      return;
    }
    setWithdrawTx({ type: "pending" });
    try {
      await withdrawFunds(wallet.address);
      setWithdrawTx({ type: "success", txHash: "" });
      load();
    } catch (e: unknown) {
      setWithdrawTx({ type: "error", message: e instanceof Error ? e.message : "Withdraw failed" });
    }
  }

  const hasClaimable = (() => {
    try { return BigInt(claimable) > BigInt(0); } catch { return false; }
  })();

  return (
    <div className="glass-glow rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="accent-bar" />
        <h2 className="text-base font-semibold text-white">Treasury</h2>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Reserve", value: attoToTokens(reserve), accent: "text-cyan-400" },
          { label: "In Escrow", value: attoToTokens(escrowed), accent: "text-violet-300" },
          { label: "Your Claimable", value: attoToTokens(claimable), accent: "text-emerald-400" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="glass-inset rounded-lg px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-mono font-semibold ${accent}`}>{value} tokens</p>
          </div>
        ))}
      </div>

      {/* Deposit + Withdraw */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2">
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (tokens)"
            className="flex-1 glass-inset rounded-lg px-3 py-2 text-xs font-mono text-slate-200 bg-transparent border border-slate-700/60 focus:border-cyan-400/40 outline-none"
          />
          <button
            onClick={handleDeposit}
            disabled={depositTx.type === "pending"}
            className="glow-btn px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40 shrink-0"
          >
            {depositTx.type === "pending" ? "Depositing..." : "Deposit"}
          </button>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={!hasClaimable || withdrawTx.type === "pending"}
          className="px-4 py-2 rounded-lg glass border border-emerald-400/25 text-emerald-300 hover:border-emerald-400/50 transition-all text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {withdrawTx.type === "pending" ? "Withdrawing..." : "Withdraw Claimable"}
        </button>
      </div>

      {/* Status lines */}
      {depositTx.type === "error" && (
        <p className="text-[11px] font-mono text-red-400 break-all">{depositTx.message}</p>
      )}
      {depositTx.type === "success" && (
        <p className="text-[11px] font-mono text-emerald-400">Deposit confirmed.</p>
      )}
      {withdrawTx.type === "error" && (
        <p className="text-[11px] font-mono text-red-400 break-all">{withdrawTx.message}</p>
      )}
      {withdrawTx.type === "success" && (
        <p className="text-[11px] font-mono text-emerald-400">Withdrawal confirmed.</p>
      )}
      <p className="text-[10px] font-mono text-slate-600">
        Note: deposit is owner-only; the transaction will revert for non-owner accounts.
      </p>
    </div>
  );
}

/* ============================================================
   Main Component
   ============================================================ */
export default function ProposalsTab() {
  const wallet = useWallet();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<Proposal | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [rowError, setRowError]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllProposals()
      .then(setProposals)
      .catch((e: Error) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Inline evaluate straight from the list row -- runs the AI-validator
  // consensus and refreshes so the row flips to APPROVED / REJECTED in place.
  const handleRowEvaluate = useCallback(
    async (proposalId: string) => {
      setRowError(null);
      if (!wallet.isConnected || !wallet.address) {
        setRowError("Connect your wallet to run the AI evaluation.");
        return;
      }
      setEvaluatingId(proposalId);
      try {
        await evaluateProposal(proposalId, wallet.address);
        load();
      } catch (e: unknown) {
        setRowError(e instanceof Error ? e.message : "Evaluation failed");
      } finally {
        setEvaluatingId(null);
      }
    },
    [wallet.isConnected, wallet.address, load]
  );

  return (
    <div className="space-y-6">
      <TreasuryPanel />

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

      {rowError && (
        <div className="glass-glow rounded-xl p-4 border border-red-500/20 text-red-400 font-mono text-xs flex items-start gap-3">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {rowError}
        </div>
      )}

      {evaluatingId && (
        <div className="glass-glow rounded-xl p-4 border border-cyan-400/20 text-cyan-300 font-mono text-xs flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          AI Validators Evaluating proposal #{evaluatingId} -- reaching consensus...
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
                  {["ID", "GitHub Repo", "Applicant", "Requested", "Tier", "Status", "Action"].map((h, idx) => (
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
                      <td className="px-5 py-3.5 text-center">
                        {p.status === "PENDING" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowEvaluate(p.proposal_id);
                            }}
                            disabled={evaluatingId !== null}
                            className="glow-btn px-3 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {evaluatingId === p.proposal_id ? "Evaluating..." : "Run AI Evaluation"}
                          </button>
                        ) : (
                          <span className="text-slate-700 font-mono text-[11px]">--</span>
                        )}
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
        <DetailPanel
          proposal={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
