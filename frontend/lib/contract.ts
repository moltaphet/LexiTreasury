import { createClient, chains } from "genlayer-js";
import type { Address, Hash } from "genlayer-js/types";

const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address) ??
  "0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf";

export interface Proposal {
  proposal_id: string;
  github_url: string;
  applicant: string;
  recipient: string;
  requested_amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FUNDED";
  tier: string;
  allocated_amount: string;
  maintainer_verified: string;
  maintainer_login: string;
  commit_bracket: string;
  contributor_bracket: string;
  quality_bracket: string;
  license_spdx: string;
  is_osi_approved: string;
  has_audit: string;
  audit_uid: string;
  evaluation_decision: string;
  evaluation_reasoning: string;
  submitted_at: string;
}

export interface AuditAttestation {
  attestation_uid: string;
  owner: string;
  repo: string;
  auditor_id: string;
  report_hash: string;
  status: string;
  recorded_at: string;
}

export interface TierCaps {
  TIER_1: string;
  TIER_2: string;
  TIER_3: string;
}

function readClient() {
  return createClient({ chain: chains.studionet });
}

export async function fetchConstitution(): Promise<string> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_constitution",
    args: [],
  });
  return result as string;
}

export async function fetchTierCaps(): Promise<TierCaps> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_tier_caps",
    args: [],
  });
  return result as unknown as TierCaps;
}

export async function fetchAllProposals(): Promise<Proposal[]> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_all_proposals",
    args: [],
  });
  return (result as unknown as Proposal[]) ?? [];
}

export async function fetchTreasuryBalance(): Promise<string> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_treasury_balance",
    args: [],
  });
  return String(result ?? "0");
}

export async function fetchTotalEscrowed(): Promise<string> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_total_escrowed",
    args: [],
  });
  return String(result ?? "0");
}

export async function fetchClaimable(address: string): Promise<string> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_claimable",
    args: [address],
  });
  return String(result ?? "0");
}

export async function fetchTrustedAuditors(): Promise<string[]> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_trusted_auditors",
    args: [],
  });
  return (result as unknown as string[]) ?? [];
}

export async function fetchAuditAttestation(
  attestationUid: string
): Promise<AuditAttestation> {
  const client = readClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_audit_attestation",
    args: [attestationUid],
  });
  return result as unknown as AuditAttestation;
}

// account is a plain address string (not an Account object) so genlayer-js
// routes eth_sendTransaction through window.ethereum (MetaMask / injected wallet).
export async function submitProposal(
  githubUrl: string,
  requestedTokens: number,
  address: string
): Promise<`0x${string}`> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet provider detected. Please install MetaMask.");
  }
  const client = createClient({ chain: chains.studionet, account: address as Address });
  const amountAtto = BigInt(Math.round(requestedTokens)) * BigInt(10 ** 18);
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "submit_proposal",
    args: [githubUrl, amountAtto],
    value: BigInt(0),
  });
  return txHash as `0x${string}`;
}

function writeClient(address: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet provider detected. Please install MetaMask.");
  }
  return createClient({ chain: chains.studionet, account: address as Address });
}

// deposit() is payable and owner-only: the treasury reserve is credited with the
// native value attached to the call, so `amountTokens` is sent as msg.value.
export async function depositToTreasury(
  amountTokens: number,
  address: string
): Promise<`0x${string}`> {
  const client = writeClient(address);
  const amountAtto = BigInt(Math.round(amountTokens)) * BigInt(10 ** 18);
  if (amountAtto <= BigInt(0)) {
    throw new Error("Deposit amount must be positive.");
  }
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "deposit",
    args: [],
    value: amountAtto,
  });
  return txHash as `0x${string}`;
}

// Block until a transaction reaches a decided (finalized/accepted) state so the
// caller can safely refresh on-chain reads afterwards. Uses the read client so
// no wallet/signing is involved. Swallows polling errors -- the worst case is
// the UI refresh happening a moment early.
export async function waitForReceipt(txHash: `0x${string}`): Promise<void> {
  try {
    const client = readClient();
    await client.waitForTransactionReceipt({
      hash: txHash as unknown as Hash,
      interval: 3000,
      retries: 40,
    });
  } catch {
    /* consensus polling timed out or errored -- caller falls back to refresh */
  }
}

// evaluate_proposal runs the AI-validator consensus pipeline against a PENDING
// proposal: the leader fetches live GitHub signals, validators independently
// re-run the identical pipeline, and consensus fixes the proposal to APPROVED or
// REJECTED (with a deterministic tier). Callable by any account. Resolves only
// after the transaction reaches consensus so a subsequent read sees the verdict.
export async function evaluateProposal(
  proposalId: string,
  address: string
): Promise<`0x${string}`> {
  const client = writeClient(address);
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "evaluate_proposal",
    args: [proposalId],
    value: BigInt(0),
  });
  await waitForReceipt(txHash as `0x${string}`);
  return txHash as `0x${string}`;
}

// execute_proposal releases an APPROVED allocation from the reserve into the
// verified recipient's claimable escrow. Callable by the owner or the recipient.
export async function executeProposal(
  proposalId: string,
  address: string
): Promise<`0x${string}`> {
  const client = writeClient(address);
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "execute_proposal",
    args: [proposalId],
    value: BigInt(0),
  });
  return txHash as `0x${string}`;
}

// withdraw pays the caller's entire claimable escrow balance out of the contract.
export async function withdrawFunds(address: string): Promise<`0x${string}`> {
  const client = writeClient(address);
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "withdraw",
    args: [],
    value: BigInt(0),
  });
  return txHash as `0x${string}`;
}

export function attoToTokens(atto: string): string {
  try {
    const val = BigInt(atto);
    const whole = val / BigInt(10 ** 18);
    return whole.toLocaleString();
  } catch {
    return "0";
  }
}

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "");
  } catch {
    return url;
  }
}
