"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import studioDevDeployment from "@/config/studio-dev-deployment.json";
import {
  adjudicate,
  cancelDraft,
  CONTRACT_ADDRESS,
  createGrant,
  depositToTreasury,
  EXPLORER_URL,
  expireMilestone,
  evaluateGrant,
  fetchAccounting,
  fetchClaimableBalance,
  fetchGrantPage,
  fetchEvaluationPolicy,
  fetchMilestones,
  formatGen,
  fundGrant,
  PAGE_SIZE,
  PendingTransactionError,
  Milestone,
  MilestoneDraft,
  Grant,
  refundUnearned,
  releaseTranche,
  submitEvidence,
  toAttoAmount,
  trackTransaction,
  withdrawFunds,
} from "@/lib/contract";

type Tab = "grants" | "create" | "mine";
type Notice =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "success"; label: string; hash?: string }
  | { kind: "error"; label: string; hash?: string; pending?: boolean };

const emptyMilestone = (daysAhead = 30): MilestoneDraft => ({
  title: "",
  criteria: "",
  amount: "",
  deadline: Math.floor(Date.now() / 1000) + daysAhead * 86400,
});

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(timestamp * 1000));
}

function dateInputValue(timestamp: number) {
  const date = new Date(timestamp * 1000 - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function TabButton({ id, current, onSelect, children }: {
  id: Tab; current: Tab; onSelect: (value: Tab) => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={id === current}
      onClick={() => onSelect(id)}
      className={`nav-tab ${id === current ? "nav-tab-active" : ""}`}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("grants");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [accounting, setAccounting] = useState({
    grant_escrow: "0", total_released: "0", total_refunded: "0",
    treasury_balance: "0", claimable_escrow: "0", owner: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(async (append = false) => {
    setLoading(true);
    setLoadError("");
    try {
      const offset = append ? grants.length : 0;
      const [page, totals] = await Promise.all([
        fetchGrantPage(offset, PAGE_SIZE),
        fetchAccounting(),
      ]);
      setGrants((current) => append ? [...current, ...page.items] : page.items);
      setHasMore(page.has_more);
      setTotal(page.total);
      setAccounting({
        grant_escrow: String(totals.grant_escrow),
        total_released: String(totals.total_released),
        total_refunded: String(totals.total_refunded),
        treasury_balance: String(totals.treasury_balance),
        claimable_escrow: String(totals.claimable_escrow),
        owner: totals.owner,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load grants.");
    } finally {
      setLoading(false);
    }
  }, [grants.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload, refreshKey]);

  const myGrants = useMemo(() => grants.filter((grant) => {
    const account = wallet.address?.toLowerCase();
    return account && (grant.applicant.toLowerCase() === account || grant.funder.toLowerCase() === account || grant.recipient.toLowerCase() === account);
  }), [grants, wallet.address]);

  async function runAction(label: string, work: () => Promise<`0x${string}`>): Promise<boolean> {
    setNotice({ kind: "working", label });
    try {
      const hash = await work();
      setNotice({ kind: "success", label: `${label} finalized successfully`, hash });
      setRefreshKey((key) => key + 1);
      return true;
    } catch (error) {
      if (error instanceof PendingTransactionError) {
        setNotice({ kind: "error", label: error.message, hash: error.hash, pending: true });
      } else {
        const err = error as Error & { hash?: `0x${string}` };
        setNotice({ kind: "error", label: err.message || `${label} failed`, hash: err.hash });
      }
      return false;
    }
  }

  async function track(hash: `0x${string}`) {
    setNotice({ kind: "working", label: "Checking the existing transaction through finalization…" });
    try {
      await trackTransaction(hash);
      setNotice({ kind: "success", label: "Transaction finalized successfully", hash });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      const err = error as Error & { hash?: `0x${string}` };
      setNotice({ kind: "error", label: err.message, hash: err.hash ?? hash, pending: error instanceof PendingTransactionError });
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LexiTreasury home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>LEXI<span className="brand-light">TREASURY</span></span>
        </a>
        <div className="topbar-right">
          <span className="network-pill"><span className="live-dot" /> STUDIO DEV <small>RC</small></span>
          {wallet.isConnected ? (
            <button className="wallet-button connected" onClick={wallet.disconnect}>
              <span className="wallet-indicator" />{shortAddress(wallet.address!)}
            </button>
          ) : (
            <button className="wallet-button" onClick={() => void wallet.connect()}>Connect wallet <span aria-hidden>↗</span></button>
          )}
        </div>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span>OPEN SOURCE GRANTS</span><span className="eyebrow-rule" /> GENLAYER CONSENSUS</p>
          <h1>Fund the work.<br /><em>Release it in stages.</em></h1>
          <p className="hero-subtitle">
            Public grants with fixed milestones, commit-pinned proof and validator-reviewed releases.
            Each tranche has a clear finish line.
          </p>
          <div className="hero-actions">
            <button className="button button-acid" onClick={() => setTab("create")}>Build a grant <span aria-hidden>↗</span></button>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden>↓</span></a>
          </div>
        </div>
        <div className="hero-graphic" aria-label="A grant releases through four milestone stages">
          <div className="graphic-top"><span>GRANT / 004</span><span>STAGED RELEASE</span></div>
          <div className="route-line"><span className="route-fill" /></div>
          <div className="route-stops">
            {["SCOPE", "BUILD", "REVIEW", "RELEASE"].map((item, i) => (
              <div className={`route-stop ${i < 2 ? "route-done" : ""}`} key={item}>
                <span className="stop-node">{i < 2 ? "✓" : `0${i + 1}`}</span><span>{item}</span>
              </div>
            ))}
          </div>
          <div className="graphic-bottom"><span>TERMS LOCK AT CREATION</span><span className="monogram">LT / 06</span></div>
        </div>
      </section>

      <aside className="rc-banner" role="note">
        <span className="rc-symbol">i</span>
        <span><strong>{studioDevDeployment.network}</strong> · Chain {studioDevDeployment.chain_id}. This preview network may reset; use test funds only.</span>
        {CONTRACT_ADDRESS && <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Contract {shortAddress(CONTRACT_ADDRESS)} ↗</a>}
        <a href="https://docs.genlayer.com/developers/consensus-v06-migration#test-on-studio-dev-first" target="_blank" rel="noreferrer">Network notes ↗</a>
      </aside>

      <section className="stat-row" aria-label="Treasury totals">
        <Stat label="Active grants" value={loading ? "—" : total.toString()} detail="publicly listed" />
        <Stat label="Reserve" value={`${formatGen(accounting.treasury_balance)} GEN`} detail="available to fund" />
        <Stat label="Grant escrow" value={`${formatGen(accounting.grant_escrow)} GEN`} detail="unearned tranches" />
        <Stat label="Claimable" value={`${formatGen(accounting.claimable_escrow)} GEN`} detail="awaiting withdrawal" />
        <Stat label="Released" value={`${formatGen(accounting.total_released)} GEN`} detail="approved work" />
        <Stat label="Returned" value={`${formatGen(accounting.total_refunded)} GEN`} detail="unearned balance" />
      </section>

      <section className="workspace">
        <div className="workspace-heading">
          <div><p className="section-kicker">GRANTS LEDGER</p><h2>Work with a finish line.</h2></div>
          <span className="page-count">{total.toString().padStart(2, "0")} RECORDS</span>
        </div>
        <EvaluationPolicy />
        {wallet.address && accounting.owner && wallet.address.toLowerCase() === accounting.owner.toLowerCase() && (
          <ReserveDeposit account={wallet.address} runAction={runAction} />
        )}
        {wallet.address && <ClaimableWithdraw account={wallet.address} refreshKey={refreshKey} runAction={runAction} />}
        <div className="tabs" role="tablist" aria-label="Grant views">
          <TabButton id="grants" current={tab} onSelect={setTab}>Explore grants</TabButton>
          <TabButton id="mine" current={tab} onSelect={setTab}>My activity <span className="tab-count">{myGrants.length}</span></TabButton>
          <TabButton id="create" current={tab} onSelect={setTab}>Create grant <span aria-hidden>＋</span></TabButton>
        </div>

        {notice.kind !== "idle" && <NoticeBar notice={notice} onTrack={track} onDismiss={() => setNotice({ kind: "idle" })} />}
        {tab === "create" ? (
          <CreateGrant walletAddress={wallet.address} onCreate={runAction} onCreated={() => setTab("mine")} />
        ) : (
          <GrantList
            grants={tab === "mine" ? myGrants : grants}
            loading={loading}
            loadError={loadError}
            hasMore={hasMore}
            onLoadMore={() => void reload(true)}
            account={wallet.address}
            refresh={() => setRefreshKey((key) => key + 1)}
            runAction={runAction}
          />
        )}
      </section>

      <section id="how-it-works" className="how-section">
        <div className="how-intro"><p className="section-kicker">A BETTER PROMISE</p><h2>Clear terms.<br /><em>Verifiable progress.</em></h2></div>
        <div className="how-steps">
        <Step index="01" title="Set the milestones" body="Applicant names the repository and recipient, then commits acceptance criteria, amounts and deadlines. Terms cannot be edited." />
          <Step index="02" title="Show the commit" body="Recipient submits a public GitHub commit URL. The evidence is pinned to one immutable 40-character SHA." />
          <Step index="03" title="Review, then release" body="Validators compare the fetched commit with the criteria. An approved tranche can be released; rejected work can be resubmitted." />
          <Step index="04" title="Return what is unearned" body="A missed deadline or exhausted retry limit makes remaining escrow refundable to the original funder." />
        </div>
      </section>

      <footer className="footer"><span>LEXITREASURY</span><span>CONSENSUS v0.6 · {studioDevDeployment.network.toUpperCase()} · CHAIN {studioDevDeployment.chain_id}</span></footer>
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="stat"><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-detail">{detail}</span></div>;
}

function ReserveDeposit({ account, runAction }: {
  account: string;
  runAction: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  return (
    <form className="fund-callout reserve-deposit" onSubmit={(event) => {
      event.preventDefault();
      void runAction("Deposit treasury reserve", () => depositToTreasury(account, amount)).then((ok) => { if (ok) setAmount(""); });
    }}>
      <div><strong>Fund the treasury reserve</strong><span>Only the contract owner can add GEN. Approved grants draw from this reserve.</span></div>
      <label className="reserve-input"><span>GEN AMOUNT</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required /></label>
      <button className="button button-dark" disabled={!amount.trim()}>Deposit reserve</button>
    </form>
  );
}

function ClaimableWithdraw({ account, refreshKey, runAction }: {
  account: string;
  refreshKey: number;
  runAction: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
}) {
  const [claimable, setClaimable] = useState("0");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetchClaimableBalance(account)
      .then((amount) => { if (active) { setClaimable(amount); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not read claimable balance."); });
    return () => { active = false; };
  }, [account, refreshKey]);
  if (error || BigInt(claimable) <= 0n) {
    return error ? <p className="inline-error" role="status">Claimable balance unavailable: {error}</p> : null;
  }
  return (
    <div className="fund-callout claimable-withdraw">
      <div><strong>{formatGen(claimable)} GEN ready to withdraw</strong><span>Released milestone tranches are held as claimable balance until you withdraw them.</span></div>
      <button className="button button-dark" onClick={() => void runAction("Withdraw claimable funds", () => withdrawFunds(account))}>Withdraw to wallet</button>
    </div>
  );
}

function EvaluationPolicy() {
  const [policy, setPolicy] = useState<{ constitution: string; caps: Record<string, string | number> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetchEvaluationPolicy()
      .then((value) => { if (active) { setPolicy(value); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load evaluation policy."); });
    return () => { active = false; };
  }, []);
  return (
    <details className="policy-details">
      <summary>Repository evaluation policy <span>Constitution · tiers · attested audits</span></summary>
      {error ? <p className="inline-error">{error}</p> : policy ? <div className="policy-content">
        <p>{policy.constitution}</p>
        <div className="policy-caps">{["TIER_1", "TIER_2", "TIER_3"].map((tier) => <span key={tier}>{tier}<b>{formatGen(policy.caps[tier] ?? 0)} GEN cap</b></span>)}</div>
        <small>Repository activity, contributors, engineering structure, OSI license, current auditor attestations, and verified maintainer payout binding are checked during grant evaluation.</small>
      </div> : <p className="policy-loading">Loading current on-chain policy…</p>}
    </details>
  );
}

function NoticeBar({ notice, onTrack, onDismiss }: {
  notice: Notice; onTrack: (hash: `0x${string}`) => void; onDismiss: () => void;
}) {
  if (notice.kind === "idle") return null;
  const positive = notice.kind === "success";
  const busy = notice.kind === "working";
  const hash = "hash" in notice ? notice.hash : undefined;
  return (
    <div className={`notice ${positive ? "notice-success" : busy ? "notice-working" : "notice-error"}`} role="status">
      <span className="notice-icon">{busy ? "◌" : positive ? "✓" : "!"}</span>
      <div className="notice-copy"><strong>{notice.label}</strong>
        {hash && <code>{hash}</code>}
        {notice.kind === "error" && notice.pending && hash && <small>The transaction ID exists. Keep tracking it; don’t resubmit this action.</small>}
      </div>
      <div className="notice-actions">
        {notice.kind === "error" && notice.pending && hash && <button className="notice-track" onClick={() => onTrack(hash as `0x${string}`)}>Track finalization</button>}
        {!busy && <button aria-label="Dismiss message" onClick={onDismiss}>×</button>}
      </div>
    </div>
  );
}

function GrantList({ grants, loading, loadError, hasMore, onLoadMore, account, refresh, runAction }: {
  grants: Grant[]; loading: boolean; loadError: string; hasMore: boolean; onLoadMore: () => void;
  account: string | null; refresh: () => void;
  runAction: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
}) {
  if (loading && grants.length === 0) return <div className="empty-ledger">Loading the grants ledger…</div>;
  if (loadError) return <div className="load-error" role="alert"><p>{loadError}</p><button className="button button-outline" onClick={refresh}>Try again</button></div>;
  if (grants.length === 0) return <div className="empty-ledger"><span className="empty-mark">＋</span><strong>No grants in this view yet.</strong><span>Start with a project, a measurable milestone and an amount earned on delivery.</span>{hasMore && <button className="button button-outline load-more" onClick={onLoadMore} disabled={loading}>{loading ? "Loading…" : "Load more grants"}</button>}</div>;
  return (
    <div className="grant-list">
      {grants.map((grant) => <GrantCard key={grant.grant_id} grant={grant} account={account} refresh={refresh} runAction={runAction} />)}
      {hasMore && <button className="button button-outline load-more" onClick={onLoadMore} disabled={loading}>{loading ? "Loading…" : "Load more grants"}</button>}
    </div>
  );
}

function GrantCard({ grant, account, refresh, runAction }: {
  grant: Grant; account: string | null; refresh: () => void;
  runAction: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
}) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestoneError, setMilestoneError] = useState("");
  const [evidence, setEvidence] = useState("");
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Math.floor(Date.now() / 1000)), 0);
    const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  const current = milestones[grant.current_index];
  const isFunder = !!account && grant.funder.toLowerCase() === account.toLowerCase();
  const isApplicant = !!account && grant.applicant.toLowerCase() === account.toLowerCase();
  const isRecipient = !!account && grant.recipient.toLowerCase() === account.toLowerCase();

  async function toggleDetails() {
    if (open) { setOpen(false); return; }
    setFetching(true);
    setMilestoneError("");
    try {
      setMilestones(await fetchMilestones(grant.grant_id));
      setOpen(true);
    } catch (error) {
      setMilestoneError(error instanceof Error ? error.message : "Could not load milestone details.");
    } finally { setFetching(false); }
  }

  async function performAction(label: string, work: () => Promise<`0x${string}`>) {
    const success = await runAction(label, work);
    if (success && open) {
      try { setMilestones(await fetchMilestones(grant.grant_id)); }
      catch (error) { setMilestoneError(error instanceof Error ? error.message : "Could not refresh milestone details."); }
    }
    return success;
  }

  const fundingTotal = BigInt(grant.total_amount);
  const released = BigInt(grant.released_amount);
  const progress = fundingTotal === 0n ? 0 : Number((released * 100n) / fundingTotal);
  const currentDeadlinePassed = current ? now >= current.deadline : false;

  return (
    <article className="grant-card">
      <div className="grant-card-top">
        <div className="grant-label"><span className={`status-dot status-${grant.status.toLowerCase()}`} />{grant.status.replace("_", " ")}</div>
        <code>{grant.grant_id.toUpperCase()}</code>
      </div>
      <div className="grant-main">
        <div className="grant-heading">
          <div><h3>{grant.title}</h3><a className="repo-link" href={grant.repository_url} target="_blank" rel="noreferrer">{grant.repository_url.replace("https://github.com/", "")}</a></div>
          <div className="grant-total"><strong>{formatGen(grant.total_amount)}</strong><span>GEN TOTAL</span></div>
        </div>
        <div className="grant-parties"><span>FUNDER <b>{shortAddress(grant.funder)}</b></span><span>RECIPIENT <b>{shortAddress(grant.recipient)}</b></span></div>
        <div className="progress-row"><span>{formatGen(grant.released_amount)} released</span><span>{formatGen(grant.remaining_amount)} still in escrow</span></div>
        <div className="progress-track" aria-label={`${progress}% released`}><span style={{ width: `${progress}%` }} /></div>
        <div className="grant-bottom">
          <span className="milestone-count">{grant.current_index} / {grant.milestone_count} milestones released</span>
          <button className="details-button" onClick={() => void toggleDetails()}>{fetching ? "Loading…" : open ? "Close details" : "Milestones & actions"} <span>{open ? "↑" : "↓"}</span></button>
        </div>
      </div>

      {grant.evaluation_decision && <div className="grant-evaluation">
        <div className="evaluation-heading"><strong>Repository evaluation</strong><span>{grant.evaluation_decision} · {grant.tier || "NO TIER"}</span></div>
        <p>{grant.evaluation_reasoning}</p>
        <div className="evaluation-signals">
          <span>Commits <b>{grant.commit_bracket}</b></span>
          <span>Contributors <b>{grant.contributor_bracket}</b></span>
          <span>Structure <b>{grant.quality_bracket}</b></span>
          <span>License <b>{grant.license_spdx || "none"} · OSI {grant.is_osi_approved}</b></span>
          <span>Maintainer <b>{grant.maintainer_login || "unverified"} · {grant.maintainer_verified}</b></span>
          <span>Audit attestation <b>{grant.has_audit} {grant.audit_uid && `· ${grant.audit_uid}`}</b></span>
        </div>
      </div>}

      {milestoneError && <p className="inline-error">{milestoneError}</p>}
      {open && <div className="milestone-panel">
        <div className="panel-title"><span>DELIVERY PLAN</span><span>FIXED AT CREATION</span></div>
        {milestones.map((milestone) => <MilestoneRow key={milestone.index} milestone={milestone} current={milestone.index === grant.current_index} />)}
        {current && grant.status !== "COMPLETED" && grant.status !== "REFUNDED" && grant.status !== "CANCELLED" && (
          <div className="action-panel">
            <p className="action-heading">CURRENT MILESTONE / {current.index + 1}</p>
            {grant.status === "DRAFT" && <div className="action-row"><div><p>Repository eligibility is checked against the DAO constitution, tier rules, maintainer identity and audit attestations.</p><small>Evaluation is permissionless and does not move funds.</small></div><button className="button button-acid" disabled={!account} onClick={() => void performAction("Evaluate grant", () => evaluateGrant(account!, grant.grant_id))}>Evaluate grant</button></div>}
            {isApplicant && grant.status === "DRAFT" && <div className="action-row"><p>Cancel is available only while this grant is still an unfunded draft.</p><button className="button button-quiet" onClick={() => void performAction("Cancel draft", () => cancelDraft(account!, grant.grant_id))}>Cancel draft</button></div>}
            {grant.status === "REJECTED" && <div className="action-row"><div><p>This repository evaluation did not qualify the grant for funding.</p><small>{grant.evaluation_reasoning}</small></div></div>}
            {grant.status === "APPROVED" && <div className="action-row"><div><p>Repository evaluation approved this plan at <strong>{grant.tier}</strong>.</p><small>Maintainer: {grant.maintainer_login || "verified"} · tier cap is enforced against the full milestone total.</small></div></div>}
            {isFunder && grant.status === "APPROVED" && <FundAction grant={grant} account={account!} runAction={performAction} />}
            {isRecipient && (grant.status === "FUNDED" || grant.status === "IN_PROGRESS") && (current.status === "READY" || current.status === "REJECTED") && !currentDeadlinePassed && (
              <form className="evidence-form" onSubmit={(event) => { event.preventDefault(); void performAction("Submit pinned evidence", () => submitEvidence(account!, grant.grant_id, evidence)).then((ok) => { if (ok) setEvidence(""); }); }}>
                <label htmlFor={`evidence-${grant.grant_id}`}>GitHub commit URL <span>40-character SHA required</span></label>
                <div className="evidence-input"><input id={`evidence-${grant.grant_id}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="https://github.com/org/repo/commit/abc123…" required /><button className="button button-dark" disabled={!evidence.trim()}>Submit evidence</button></div>
                <small>{current.max_attempts - current.attempts} submission attempts remain before this grant becomes refundable.</small>
              </form>
            )}
            {current.status === "SUBMITTED" && (grant.status === "FUNDED" || grant.status === "IN_PROGRESS") && (
              <div className="action-row"><div><p>Evidence is pinned at <a href={current.evidence_url} target="_blank" rel="noreferrer">commit {current.commit_sha.slice(0, 10)} ↗</a></p><small>{current.attempts} of {current.max_attempts} submissions used · deadline {formatDate(current.deadline)}</small></div><button className="button button-acid" disabled={!account} onClick={() => void performAction("Adjudicate milestone", () => adjudicate(account!, grant.grant_id))}>Run consensus review</button></div>
            )}
            {current.status === "APPROVED" && <div className="action-row"><div><p>Consensus approved this tranche: <strong>{formatGen(current.amount)} GEN</strong>.</p><small>Release transfers funds to the recipient.</small></div>{(isFunder || isRecipient) && <button className="button button-acid" onClick={() => void performAction("Release approved tranche", () => releaseTranche(account!, grant.grant_id))}>Release tranche</button>}</div>}
            {currentDeadlinePassed && current.status !== "APPROVED" && grant.status !== "REFUNDABLE" && (
              <div className="action-row"><div><p>The current milestone deadline has passed.</p><small>The contract can now make remaining escrow refundable.</small></div><button className="button button-quiet" disabled={!account} onClick={() => void performAction("Mark milestone expired", () => expireMilestone(account!, grant.grant_id))}>Mark expired</button></div>
            )}
            {grant.status === "REFUNDABLE" && <div className="action-row"><div><p><strong>{formatGen(grant.remaining_amount)} GEN</strong> is eligible to return to the original funder.</p><small>Anyone may trigger the refund; the contract sends it only to the funder.</small></div><button className="button button-quiet" disabled={!account} onClick={() => void performAction("Refund unearned escrow", () => refundUnearned(account!, grant.grant_id))}>Refund unearned</button></div>}
          </div>
        )}
      </div>}
    </article>
  );
}

function FundAction({ grant, account, runAction }: {
  grant: Grant; account: string; runAction: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="fund-callout">
      <div><strong>Fund from treasury reserve</strong><span>{formatGen(grant.total_amount)} GEN · terms lock when the reserve allocates this exact total.</span></div>
      {confirm ? <div className="confirm-actions"><button className="button button-quiet" onClick={() => setConfirm(false)}>Review plan</button><button className="button button-acid" onClick={() => void runAction("Fund grant", () => fundGrant(account, grant.grant_id))}>Confirm & fund</button></div> : <button className="button button-acid" onClick={() => setConfirm(true)}>Review funding</button>}
    </div>
  );
}

function MilestoneRow({ milestone, current }: { milestone: Milestone; current: boolean }) {
  return (
    <div className={`milestone-row ${current ? "milestone-current" : ""}`}>
      <div className="milestone-index">{String(milestone.index + 1).padStart(2, "0")}</div>
      <div className="milestone-info"><div className="milestone-title-line"><strong>{milestone.title}</strong><span className={`milestone-status ms-${milestone.status.toLowerCase()}`}>{milestone.status}</span></div>
        <p>{milestone.criteria}</p>
        {milestone.summary && <blockquote><span>{milestone.reason_code}</span> {milestone.summary}</blockquote>}
        {milestone.evidence_url && <a className="commit-link" href={milestone.evidence_url} target="_blank" rel="noreferrer">View pinned commit ↗ <code>{milestone.commit_sha.slice(0, 10)}</code></a>}
        <span className="milestone-deadline">DUE {formatDate(milestone.deadline)} · {milestone.attempts}/{milestone.max_attempts} ATTEMPTS</span>
      </div>
      <div className="milestone-amount"><strong>{formatGen(milestone.amount)}</strong><span>GEN</span></div>
    </div>
  );
}

function CreateGrant({ walletAddress, onCreate, onCreated }: {
  walletAddress: string | null;
  onCreate: (label: string, work: () => Promise<`0x${string}`>) => Promise<boolean>;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [recipient, setRecipient] = useState("");
  const [steps, setSteps] = useState<MilestoneDraft[]>([emptyMilestone(), emptyMilestone(60)]);
  const [localError, setLocalError] = useState("");
  const total = steps.reduce((sum, step) => {
    try { return sum + toAttoAmount(step.amount || "0"); } catch { return sum; }
  }, 0n);

  function changeStep(index: number, key: keyof MilestoneDraft, value: string) {
    setSteps((old) => old.map((step, i) => i === index ? {
      ...step,
      [key]: key === "deadline" ? Math.floor(new Date(value).getTime() / 1000) : value,
    } : step));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (!walletAddress) { setLocalError("Connect the applicant wallet before creating a grant."); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) { setLocalError("Enter a valid 20-byte recipient address."); return; }
    try {
      steps.forEach((step) => toAttoAmount(step.amount));
      if (steps.some((step) => !step.title.trim() || !step.criteria.trim())) throw new Error("Every milestone needs a title and acceptance criteria.");
      if (steps.some((step, index) => step.deadline <= Math.floor(Date.now() / 1000) || (index > 0 && step.deadline <= steps[index - 1].deadline))) throw new Error("Set future deadlines in strictly increasing order.");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Check the grant details."); return; }
    if (await onCreate("Create grant draft", () => createGrant(walletAddress, title, repositoryUrl, recipient, steps))) onCreated();
  }

  return (
    <div className="create-layout">
      <form className="create-form" onSubmit={(event) => void handleCreate(event)}>
        <div className="form-heading"><p className="section-kicker">NEW GRANT / DRAFT</p><h3>Make the finish line visible.</h3><p>The plan is immutable from creation. The applicant can cancel it only before funding.</p></div>
        <label className="field-label">Project or grant name<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Maintain the open-source indexer" required /></label>
        <label className="field-label">GitHub repository<input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} type="url" placeholder="https://github.com/org/project" required /></label>
        <label className="field-label">Recipient wallet<input value={recipient} onChange={(event) => setRecipient(event.target.value)} spellCheck={false} placeholder="0x…" required /></label>

        <div className="form-section-label"><span>DELIVERY PLAN</span><span>{steps.length} / 10</span></div>
        <div className="editor-list">{steps.map((step, index) => (
          <fieldset className="milestone-editor" key={index}>
            <legend><span>{String(index + 1).padStart(2, "0")}</span> MILESTONE</legend>
            <button type="button" className="remove-step" aria-label={`Remove milestone ${index + 1}`} onClick={() => setSteps((old) => old.filter((_, i) => i !== index))} disabled={steps.length <= 1}>×</button>
            <label className="field-label">Milestone title<input value={step.title} onChange={(event) => changeStep(index, "title", event.target.value)} maxLength={120} placeholder="A deliverable, not an activity" required /></label>
            <label className="field-label">Acceptance criteria<textarea value={step.criteria} onChange={(event) => changeStep(index, "criteria", event.target.value)} maxLength={2000} rows={3} placeholder="State what evidence a reviewer should see in the pinned commit." required /></label>
            <div className="field-grid"><label className="field-label">Tranche <span className="field-unit">GEN</span><input value={step.amount} onChange={(event) => changeStep(index, "amount", event.target.value)} inputMode="decimal" placeholder="0.00" required /></label><label className="field-label">Deadline<input type="datetime-local" value={dateInputValue(step.deadline)} onChange={(event) => changeStep(index, "deadline", event.target.value)} required /></label></div>
          </fieldset>
        ))}</div>
        <button type="button" className="add-step" disabled={steps.length >= 10} onClick={() => setSteps((old) => [...old, emptyMilestone((old.length + 1) * 30)])}>＋ Add milestone <span>up to 10</span></button>
        {localError && <p className="inline-error" role="alert">{localError}</p>}
        <button className="button button-acid create-submit" type="submit" disabled={!title.trim() || steps.length < 1}>Create fixed-term draft <span>↗</span></button>
      </form>
      <aside className="create-aside">
        <div className="total-card"><span>PLANNED GRANT VALUE</span><strong>{formatGen(total)} <small>GEN</small></strong><p>The treasury owner funds this exact milestone total from the reserve after repository evaluation.</p><div className="total-rule" />{steps.map((step, index) => <div className="total-line" key={index}><span>{step.title || `Milestone ${index + 1}`}</span><b>{step.amount || "0"} GEN</b></div>)}</div>
        <div className="term-card"><span className="term-icon">⌁</span><strong>Before you submit</strong><ul><li>Review criteria, amount and deadline with the recipient.</li><li>The repository maintainer manifest must bind the recipient address for eligibility.</li><li>Terms cannot be edited; cancel and recreate an unfunded draft to change them.</li><li>Refunds return only unearned escrow to the treasury reserve after expiry or retry exhaustion.</li><li>Consensus reviews the submitted pinned commit against criteria; it cannot guarantee real-world completion.</li></ul></div>
      </aside>
    </div>
  );
}

function Step({ index, title, body }: { index: string; title: string; body: string }) {
  return <article className="how-step"><span>{index}</span><h3>{title}</h3><p>{body}</p></article>;
}
