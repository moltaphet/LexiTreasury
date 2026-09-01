"use client";

import { useState } from "react";

/* ============================================================
   FAQ data
   ============================================================ */
const FAQS: { q: string; a: React.ReactNode; tag: string }[] = [
  {
    tag: "Basics",
    q: "What is LexiTreasury?",
    a: (
      <p>
        LexiTreasury is an autonomous treasury smart contract deployed on GenLayer. It
        evaluates GitHub-based funding proposals against a natural-language DAO constitution
        through AI consensus across 5 validator nodes. No human committee, no multisig
        quorum -- the contract and its constitution are the sole decision-making authority.
      </p>
    ),
  },
  {
    tag: "Basics",
    q: "What is GenLayer and why does it matter here?",
    a: (
      <p>
        GenLayer is a blockchain whose virtual machine (GenVM) can execute non-deterministic
        code -- including LLM prompts and live HTTP calls -- inside a smart contract, with
        validators reaching consensus on the outcome. This is what makes LexiTreasury
        possible: the contract fetches live GitHub data and asks an LLM a question, all
        on-chain, without trusting any oracle or off-chain relay.
      </p>
    ),
  },
  {
    tag: "Proposals",
    q: "How do I submit a proposal?",
    a: (
      <div className="space-y-2">
        <p>
          Open the{" "}
          <span className="text-cyan-400 font-medium">Submit Proposal</span> tab and fill
          in three fields:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
          <li>
            <span className="text-slate-300">GitHub repository URL</span> -- must start
            with{" "}
            <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded">
              https://github.com/
            </span>
          </li>
          <li>
            <span className="text-slate-300">Requested token amount</span> -- capped by
            the tier your project qualifies for (max 10,000 for Tier 1)
          </li>
          <li>
            <span className="text-slate-300">Private key</span> -- a StudioNet account key
            used client-side to sign the transaction; never stored
          </li>
        </ol>
        <p>
          After submission, validators evaluate the proposal asynchronously. Check
          the{" "}
          <span className="text-cyan-400 font-medium">Proposals &amp; Audits</span> tab
          after ~30 seconds to see the outcome.
        </p>
      </div>
    ),
  },
  {
    tag: "Proposals",
    q: "What GitHub metrics does the contract inspect?",
    a: (
      <div className="space-y-2">
        <p>Three live API calls are made during each evaluation:</p>
        <div className="space-y-2 mt-1">
          {[
            {
              call: "GET /repos/:owner/:repo",
              data: "License SPDX identifier (e.g. MIT, Apache-2.0). Checked against a hardcoded list of OSI-approved identifiers.",
            },
            {
              call: "GET /repos/:owner/:repo/commits",
              data: "Total commit count, paginated if needed. Bucketed into one of 5 activity brackets: NONE, MINIMAL, ACTIVE, MATURE, VETERAN.",
            },
            {
              call: "GET /repos/:owner/:repo/contents/",
              data: "Root directory listing, scanned for audit-related filenames (audit.md, audits/, security-report.pdf, etc.).",
            },
          ].map(({ call, data }) => (
            <div key={call} className="glass-inset rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-mono text-cyan-400/80 mb-0.5">{call}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{data}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600">
          All requests use{" "}
          <span className="font-mono">Accept: application/vnd.github.v3+json</span> and{" "}
          <span className="font-mono">User-Agent: LexiTreasury/1.0</span>. No auth token
          is required for public repositories.
        </p>
      </div>
    ),
  },
  {
    tag: "Tiers",
    q: "How are funding tier allocations determined?",
    a: (
      <div className="space-y-2">
        <p>
          Tier assignment is computed by a pure deterministic Python function{" "}
          <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">
            _compute_tier(bracket, is_osi, has_audit, quality, contributors)
          </span>{" "}
          -- no LLM is involved. This guarantees all 5 validators agree on the same
          tier regardless of network state. Anti-gaming gates fail-closed on zero
          commits, bot-only histories, or repositories with no structural quality.
        </p>
        <div className="space-y-1.5 mt-1">
          {[
            { tier: "TIER_1", cap: "10,000 tokens", rule: "MATURE/VETERAN + OSI + on-chain audit + STANDARD+ quality + real team", color: "text-cyan-400" },
            { tier: "TIER_2", cap:  "5,000 tokens", rule: "MATURE/VETERAN + OSI OR verified audit; or ACTIVE + OSI",              color: "text-violet-400" },
            { tier: "TIER_3", cap:  "1,000 tokens", rule: "MINIMAL or better + at least BASIC structural quality",                color: "text-slate-400" },
          ].map(({ tier, cap, rule, color }) => (
            <div key={tier} className="glass-inset rounded-lg px-3 py-2.5 flex items-start gap-3">
              <span className={`text-[11px] font-mono font-bold w-14 shrink-0 ${color}`}>{tier}</span>
              <div className="flex-1">
                <span className="text-xs text-slate-300">{rule}</span>
                <span className={`ml-2 text-[10px] font-mono ${color}`}>({cap})</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          If the LLM returns REJECTED the tier is discarded. A NONE commit bracket,
          a bot-only contributor profile, or zero structural quality always results
          in no allocation regardless of the LLM outcome (fail-closed).
        </p>
      </div>
    ),
  },
  {
    tag: "Tiers",
    q: "What are the commit activity brackets?",
    a: (
      <div className="space-y-2">
        <p>
          Commit counts are mapped to invariant brackets before evaluation. Using buckets
          rather than raw counts eliminates validator divergence caused by new commits
          appearing between the leader and validator fetches.
        </p>
        <div className="grid grid-cols-5 gap-1.5 mt-2">
          {[
            { b: "NONE",    r: "0",       c: "#f87171" },
            { b: "MINIMAL", r: "1-9",     c: "#64748b" },
            { b: "ACTIVE",  r: "10-99",   c: "#818cf8" },
            { b: "MATURE",  r: "100-499", c: "#38bdf8" },
            { b: "VETERAN", r: "500+",    c: "#22d3ee" },
          ].map(({ b, r, c }) => (
            <div key={b} className="glass-inset rounded-lg p-2 text-center">
              <p className="text-[10px] font-mono font-bold" style={{ color: c }}>{b}</p>
              <p className="text-[10px] font-mono text-slate-600 mt-0.5">{r}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    tag: "Validators",
    q: "What are validator nodes and why are 5 needed?",
    a: (
      <p>
        Validator nodes are independent GenLayer network participants that each
        re-execute the contract logic and verify the leader node's result.
        Having 5 validators provides a strong consensus signal: even if one
        validator has a transient network failure or an LLM model outage, the
        remaining 4 can still reach a supermajority. LexiTreasury was deployed
        with 5/5 validators confirming the constructor call, and proposal
        evaluations require the same supermajority to finalize.
      </p>
    ),
  },
  {
    tag: "Validators",
    q: "What happens when validators disagree?",
    a: (
      <div className="space-y-2">
        <p>
          GenLayer's consensus model handles disagreement through the error classification
          system. LexiTreasury uses four error prefixes to guide validator behavior:
        </p>
        <div className="space-y-1.5">
          {[
            { prefix: "[EXPECTED]",  color: "text-cyan-400",   desc: "Deterministic business-logic errors. All validators must produce the same error or they disagree." },
            { prefix: "[EXTERNAL]",  color: "text-sky-400",    desc: "Deterministic 4xx responses from GitHub (repo not found, private repo). Validators must match exactly." },
            { prefix: "[TRANSIENT]", color: "text-amber-400",  desc: "Network failures or 5xx. Validators agree if both sides hit a transient error, even if the details differ." },
            { prefix: "[LLM_ERROR]", color: "text-red-400",    desc: "Malformed LLM output that cannot be parsed. Forces node rotation so a healthy validator takes over." },
          ].map(({ prefix, color, desc }) => (
            <div key={prefix} className="glass-inset rounded-lg px-3 py-2.5 flex items-start gap-3">
              <span className={`text-[10px] font-mono font-bold shrink-0 w-28 ${color}`}>{prefix}</span>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    tag: "Technical",
    q: "What happens after a proposal is APPROVED?",
    a: (
      <p>
        An APPROVED proposal has its{" "}
        <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">
          status
        </span>{" "}
        field set to{" "}
        <span className="text-emerald-400 font-medium">APPROVED</span> and its{" "}
        <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">
          allocated_amount
        </span>{" "}
        set to the minimum of the requested amount and the tier cap -- all written
        on-chain during the consensus transaction. A subsequent call to{" "}
        <span className="font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300">
          fund_proposal(proposal_id)
        </span>{" "}
        by the treasury owner then transfers the allocated tokens and moves the status
        to FUNDED.
      </p>
    ),
  },
  {
    tag: "Technical",
    q: "Is the private key I enter in the form safe?",
    a: (
      <p>
        The private key is used client-side only -- inside the browser -- by the
        genlayer-js SDK to sign the transaction before it is broadcast to the
        StudioNet RPC endpoint. It is never sent to any server, never stored in
        localStorage or cookies, and cleared from React state after a successful
        submission. This dashboard is a testnet tool; never enter a mainnet or
        high-value key into a web form.
      </p>
    ),
  },
];

/* ============================================================
   Accordion item
   ============================================================ */
function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: (typeof FAQS)[number];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`glass-glow rounded-xl overflow-hidden transition-all duration-200 ${
        isOpen ? "border-cyan-400/20" : "border-slate-800/60 hover:border-slate-700/80"
      }`}
    >
      {/* Question row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border tracking-widest uppercase ${
              isOpen
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-400"
                : "border-slate-700 bg-slate-800/60 text-slate-600"
            }`}
          >
            {item.tag}
          </span>
          <span
            className={`text-sm font-medium transition-colors duration-150 ${
              isOpen ? "text-white" : "text-slate-300 group-hover:text-white"
            }`}
          >
            {item.q}
          </span>
        </div>
        <div
          className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center border transition-all duration-200 ${
            isOpen
              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-400 rotate-45"
              : "border-slate-700 bg-slate-800/60 text-slate-500 rotate-0"
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </button>

      {/* Answer panel */}
      {isOpen && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-800/50">
          <div className="text-sm text-slate-400 leading-relaxed space-y-2 animate-fade-up">
            {item.a}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Tag filter buttons
   ============================================================ */
const TAGS = ["All", "Basics", "Proposals", "Tiers", "Validators", "Technical"];

/* ============================================================
   Main component
   ============================================================ */
export default function FaqSection() {
  const [openIdx, setOpenIdx]       = useState<number | null>(null);
  const [activeTag, setActiveTag]   = useState("All");

  const visible = FAQS.filter((f) => activeTag === "All" || f.tag === activeTag);

  function toggle(globalIdx: number) {
    setOpenIdx((prev) => (prev === globalIdx ? null : globalIdx));
  }

  return (
    <section className="relative border-t border-slate-800/50 overflow-hidden">
      {/* Background tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 20% 60%, rgba(34,211,238,0.03) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="accent-bar" />
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                FAQ
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold">
              <span className="gradient-text">Frequently Asked</span>{" "}
              <span className="text-slate-200">Questions</span>
            </h2>
          </div>
          <p className="text-slate-500 text-sm max-w-xs sm:text-right">
            Everything you need to know before submitting a proposal or integrating
            with the protocol.
          </p>
        </div>

        {/* Tag filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setActiveTag(tag);
                setOpenIdx(null);
              }}
              className={`px-3 py-1 rounded-full border text-[11px] font-mono transition-all duration-150 ${
                activeTag === tag
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {tag}
            </button>
          ))}
          <span className="ml-auto text-[10px] font-mono text-slate-700 self-center">
            {visible.length} item{visible.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Accordion list */}
        <div className="space-y-3">
          {visible.map((item) => {
            const globalIdx = FAQS.indexOf(item);
            return (
              <AccordionItem
                key={item.q}
                item={item}
                isOpen={openIdx === globalIdx}
                onToggle={() => toggle(globalIdx)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
