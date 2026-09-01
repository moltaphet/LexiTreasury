"use client";

/* ============================================================
   Feature card data
   ============================================================ */
const PILLARS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    label: "AI-Governed Decisions",
    desc: "No multisig, no committee. A natural-language constitution stored on-chain is the sole arbiter of every funding decision, interpreted live by a large language model.",
    accent: { border: "border-cyan-400/20", text: "text-cyan-400", bg: "bg-cyan-400/8", glow: "rgba(34,211,238,0.04)" },
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: "Deterministic Consensus",
    desc: "Tier assignment is pure Python — no LLM, no randomness. All 5 validators compute the same tier from the same bracket, license, and audit data every time.",
    accent: { border: "border-indigo-400/20", text: "text-indigo-400", bg: "bg-indigo-400/8", glow: "rgba(129,140,248,0.04)" },
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    label: "Live GitHub Verification",
    desc: "Every proposal evaluation fetches live commit counts, the SPDX license identifier, and root-level audit markers directly from the GitHub API — no self-reporting.",
    accent: { border: "border-sky-400/20", text: "text-sky-400", bg: "bg-sky-400/8", glow: "rgba(56,189,248,0.04)" },
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Permissionless Submissions",
    desc: "Any wallet on GenLayer StudioNet can submit a proposal. No allow-listing, no off-chain application process. The smart contract is the gatekeeper.",
    accent: { border: "border-violet-400/20", text: "text-violet-400", bg: "bg-violet-400/8", glow: "rgba(167,139,250,0.04)" },
  },
];

const METRICS = [
  { label: "Validators",     value: "5",          sub: "per evaluation" },
  { label: "Tier Levels",    value: "3",          sub: "deterministic" },
  { label: "Commit Brackets","value": "5",        sub: "NONE to VETERAN" },
  { label: "Consensus",      value: "100%",       sub: "deploy consensus" },
];

/* ============================================================
   Feature Card
   ============================================================ */
function PillarCard({
  icon, label, desc, accent,
}: (typeof PILLARS)[number]) {
  return (
    <div
      className={`glass-glow rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden group border ${accent.border}`}
      style={{ boxShadow: `0 0 24px ${accent.glow}` }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-6 right-6 h-px opacity-50"
        style={{ background: `linear-gradient(90deg, transparent, currentColor, transparent)` }}
      />
      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center border ${accent.bg} ${accent.text} ${accent.border} group-hover:scale-105 transition-transform duration-200`}
      >
        {icon}
      </div>
      {/* Text */}
      <div>
        <h3 className={`text-sm font-semibold ${accent.text} mb-1`}>{label}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Main component
   ============================================================ */
export default function AboutSection() {
  return (
    <section className="relative border-t border-slate-800/50 overflow-hidden">
      {/* Background radial */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 80% 50%, rgba(129,140,248,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-16">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="accent-bar" />
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                Protocol Overview
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold leading-tight">
              <span className="gradient-text">What is LexiTreasury?</span>
            </h2>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-lg md:text-right">
            A fully autonomous treasury protocol where funding decisions are made
            entirely by AI consensus — no multisig, no governance tokens, no humans
            in the loop.
          </p>
        </div>

        {/* Two-column intro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Left: main narrative */}
          <div className="glass-glow rounded-xl p-6 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
            <div className="space-y-3 text-sm text-slate-400 leading-relaxed">
              <p>
                LexiTreasury runs as an <span className="text-cyan-400 font-medium">intelligent contract</span> on
                GenLayer — a blockchain with a built-in virtual machine capable of executing
                non-deterministic logic through validator consensus. Proposers link their GitHub
                repository and request a token allocation.
              </p>
              <p>
                The contract fetches three live signals from GitHub:{" "}
                <span className="text-slate-300">commit count</span> (bucketed into
                5 invariant activity brackets),{" "}
                <span className="text-slate-300">SPDX license identifier</span> (checked
                against an OSI-approved list), and{" "}
                <span className="text-slate-300">root-level audit file presence</span>.
              </p>
              <p>
                These metrics feed a deterministic tier computation{" "}
                <span className="text-indigo-400 font-mono text-xs">(_compute_tier)</span>{" "}
                — pure Python, no LLM — ensuring all 5 validators agree on the same
                tier cap regardless of network conditions or model temperature.
              </p>
              <p>
                The LLM is scoped only to a binary{" "}
                <span className="text-emerald-400 font-medium">APPROVED</span> /{" "}
                <span className="text-red-400 font-medium">REJECTED</span> decision,
                reducing consensus surface area and eliminating validator divergence on
                the allocation amount.
              </p>
            </div>
          </div>

          {/* Right: Why GenLayer */}
          <div className="glass-glow rounded-xl p-6 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/25 to-transparent" />
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Why GenLayer?
            </h3>
            <div className="space-y-3">
              {[
                {
                  q: "Non-determinism by design",
                  a: "GenLayer's GenVM separates leader execution from validator verification, allowing LLM calls to exist inside a smart contract without breaking consensus.",
                },
                {
                  q: "Equivalence checking",
                  a: "Validators do not re-run LLM calls identically — they verify equivalence. A validator compares its own APPROVED/REJECTED result to the leader's and agrees if they match.",
                },
                {
                  q: "Gasless StudioNet",
                  a: "Development and testing are frictionless. Any wallet can deploy, write, and read contracts on StudioNet with zero gas fees.",
                },
              ].map(({ q, a }) => (
                <div key={q} className="glass-inset rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-indigo-300">{q}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {METRICS.map(({ label, value, sub }) => (
            <div
              key={label}
              className="glass-glow rounded-xl px-4 py-4 flex flex-col items-center gap-1 text-center"
            >
              <span className="text-2xl font-extrabold font-mono gradient-text">{value}</span>
              <span className="text-xs font-semibold text-slate-300">{label}</span>
              <span className="text-[10px] font-mono text-slate-600">{sub}</span>
            </div>
          ))}
        </div>

        {/* Pillar cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((p) => (
            <PillarCard key={p.label} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
