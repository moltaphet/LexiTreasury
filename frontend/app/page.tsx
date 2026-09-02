"use client";

import { useState } from "react";
import { WalletProvider } from "@/contexts/WalletContext";
import Header from "@/components/Header";
import TabNav, { type TabId } from "@/components/TabNav";
import ConstitutionTab from "@/components/ConstitutionTab";
import ProposalsTab from "@/components/ProposalsTab";
import SubmitTab from "@/components/SubmitTab";
import AboutSection from "@/components/AboutSection";
import FaqSection from "@/components/FaqSection";
import Footer from "@/components/Footer";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("constitution");
  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);

  function handleProposalSubmitted() {
    setActiveTab("proposals");
    setProposalRefreshKey((k) => k + 1);
  }

  function scrollToApp() {
    document.getElementById("app-tabs")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <WalletProvider>
    <div className="min-h-screen page-bg">
      <Header />

      {/* ======================================================
          Hero Banner
          ====================================================== */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 120% at 50% 0%, rgba(34,211,238,0.07) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 py-12">
          {/* Chips */}
          <div className="flex items-center gap-2 mb-5">
            <span className="px-2.5 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 text-[10px] font-mono font-semibold tracking-widest uppercase">
              Live on StudioNet
            </span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-400/10 border border-indigo-400/20 text-indigo-300 text-[10px] font-mono font-semibold tracking-widest uppercase">
              5 Validators Active
            </span>
            <span className="px-2.5 py-1 rounded-full bg-violet-400/10 border border-violet-400/20 text-violet-300 text-[10px] font-mono font-semibold tracking-widest uppercase">
              Agent Tank 2026
            </span>
          </div>

          {/* Headline */}
          <div className="max-w-2xl mb-6">
            <h2 className="text-3xl md:text-4xl font-extrabold leading-tight mb-4">
              <span className="gradient-text">Autonomous Treasury</span>
              <br />
              <span className="text-slate-200">Governed by AI Consensus</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              LexiTreasury evaluates GitHub repositories against a natural-language
              DAO constitution -- live on GenLayer. Each proposal triggers a
              non-deterministic AI consensus across 5 validators before any
              funding decision is made.
            </p>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3 mb-10">
            <button
              onClick={scrollToApp}
              className="glow-btn px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Launch Dashboard
            </button>
            <button
              onClick={() => {
                document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-5 py-2.5 rounded-lg glass border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600 transition-all text-sm font-medium"
            >
              Learn More
            </button>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Contract",   value: `${CONTRACT_ADDRESS.slice(0,8)}...${CONTRACT_ADDRESS.slice(-6)}`, accent: "text-cyan-400" },
              { label: "Validators", value: "5 / 5",           accent: "text-emerald-400" },
              { label: "Consensus",  value: "100%",            accent: "text-emerald-400" },
              { label: "Tier Max",   value: "10,000 tokens",   accent: "text-violet-400" },
              { label: "Chain ID",   value: "61999",           accent: "text-slate-300" },
            ].map(({ label, value, accent }) => (
              <div
                key={label}
                className="glass-glow rounded-xl px-4 py-3 flex flex-col gap-0.5 min-w-[110px]"
              >
                <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                  {label}
                </span>
                <span className={`text-sm font-mono font-semibold ${accent}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================
          Tab dashboard
          ====================================================== */}
      <div id="app-tabs">
        <TabNav active={activeTab} onChange={setActiveTab} />
        <main className="max-w-6xl mx-auto px-4 py-8 animate-fade-up">
          {activeTab === "constitution" && <ConstitutionTab />}
          {activeTab === "proposals" && (
            <ProposalsTab key={proposalRefreshKey} />
          )}
          {activeTab === "submit" && (
            <SubmitTab onProposalSubmitted={handleProposalSubmitted} />
          )}
        </main>
      </div>

      {/* ======================================================
          About Section
          ====================================================== */}
      <div id="about">
        <AboutSection />
      </div>

      {/* ======================================================
          FAQ Section
          ====================================================== */}
      <FaqSection />

      {/* ======================================================
          Footer
          ====================================================== */}
      <Footer onNavigate={(tab) => {
        setActiveTab(tab);
        document.getElementById("app-tabs")?.scrollIntoView({ behavior: "smooth" });
      }} />
    </div>
    </WalletProvider>
  );
}
