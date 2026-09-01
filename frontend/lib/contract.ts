import { createClient, chains } from "genlayer-js";
import type { Address } from "genlayer-js/types";

const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address) ??
  "0xE091479d636d716b0a3eFcdb6232Dd420d3dFbF9";

export interface Proposal {
  proposal_id: string;
  github_url: string;
  applicant: string;
  requested_amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FUNDED";
  tier: string;
  allocated_amount: string;
  commit_bracket: string;
  license_spdx: string;
  is_osi_approved: string;
  has_audit: string;
  evaluation_decision: string;
  evaluation_reasoning: string;
  submitted_at: string;
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
