"use client";

export type TabId = "constitution" | "proposals" | "submit";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

function ConstitutionIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ProposalsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 4v16m8-8H4" />
    </svg>
  );
}

const TABS: Tab[] = [
  { id: "constitution", label: "Constitution & Overview", icon: <ConstitutionIcon /> },
  { id: "proposals",   label: "Proposals & Audits",      icon: <ProposalsIcon /> },
  { id: "submit",      label: "Submit Proposal",          icon: <SubmitIcon /> },
];

interface TabNavProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

export default function TabNav({ active, onChange }: TabNavProps) {
  return (
    <nav className="relative">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex">
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={[
                  "relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium",
                  "border-b-2 transition-all duration-200",
                  isActive
                    ? "border-cyan-400 text-cyan-400"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600",
                ].join(" ")}
              >
                <span className={isActive ? "text-cyan-400" : "text-slate-600"}>
                  {tab.icon}
                </span>
                {tab.label}
                {isActive && (
                  <>
                    {/* Glow blur underline */}
                    <span className="absolute bottom-0 left-4 right-4 h-px bg-cyan-400/60 blur-sm" />
                    {/* Subtle tab background */}
                    <span className="absolute inset-0 bg-gradient-to-b from-cyan-400/5 to-transparent pointer-events-none" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
