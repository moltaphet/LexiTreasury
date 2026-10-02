import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address, Hash } from "genlayer-js/types";
import studioDevDeployment from "@/config/studio-dev-deployment.json";

export const CONTRACT_ADDRESS = studioDevDeployment.contract_address as Address | null;
export const EXPLORER_URL = `${studioDevDeployment.explorer_base_url}address/${CONTRACT_ADDRESS}`;
export const PAGE_SIZE = 20;

export type GrantStatus =
  | "DRAFT"
  | "APPROVED"
  | "REJECTED"
  | "FUNDED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REFUNDABLE"
  | "REFUNDED"
  | "CANCELLED";

export interface Grant {
  grant_id: string;
  title: string;
  repository_url: string;
  funder: string;
  applicant: string;
  recipient: string;
  status: GrantStatus;
  milestone_count: number;
  current_index: number;
  total_amount: string | number;
  remaining_amount: string | number;
  released_amount: string | number;
  refunded_amount: string | number;
  tier: string;
  allocated_amount: string | number;
  evaluation_decision: string;
  evaluation_reasoning: string;
  maintainer_verified: string;
  maintainer_login: string;
  commit_bracket: string;
  contributor_bracket: string;
  quality_bracket: string;
  license_spdx: string;
  is_osi_approved: string;
  has_audit: string;
  audit_uid: string;
}

export interface Milestone {
  index: number;
  title: string;
  criteria: string;
  amount: string | number;
  deadline: number;
  status: "READY" | "SUBMITTED" | "APPROVED" | "REJECTED" | "RELEASED" | "EXPIRED";
  attempts: number;
  max_attempts: number;
  evidence_url: string;
  commit_sha: string;
  decision: string;
  reason_code: string;
  summary: string;
  released_amount: string | number;
}

export interface Page<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
  has_more: boolean;
}

export interface MilestoneDraft {
  title: string;
  criteria: string;
  amount: string;
  deadline: number;
}

function activeContractAddress(): Address {
  if (!CONTRACT_ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error(
      "The unified Studio Dev LexiTreasury contract has not been deployed or configured yet.",
    );
  }
  return CONTRACT_ADDRESS;
}

function readClient() {
  return createClient({ chain: studioDevnet });
}

function writeClient(account: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask or Rabby and reconnect.");
  }
  if (!account) throw new Error("Connect a wallet before submitting a transaction.");
  return createClient({
    chain: studioDevnet,
    account: account as Address,
    provider: window.ethereum as never,
  });
}

export function toAttoAmount(value: string): bigint {
  const cleaned = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(cleaned)) {
    throw new Error("Enter a positive GEN amount with at most 18 decimal places.");
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const amount = BigInt(whole) * 10n ** 18n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
  if (amount <= 0n) throw new Error("Milestone amount must be greater than zero.");
  return amount;
}

export function formatGen(value: string | number | bigint): string {
  const amount = BigInt(value);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function fetchGrantPage(offset: number, limit = PAGE_SIZE): Promise<Page<Grant>> {
  const result = await readClient().readContract({
    address: activeContractAddress(),
    functionName: "get_grants",
    args: [offset, limit],
  });
  return result as unknown as Page<Grant>;
}

export async function fetchMilestones(grantId: string): Promise<Milestone[]> {
  const result = await readClient().readContract({
    address: activeContractAddress(),
    functionName: "get_milestones",
    args: [grantId, 0, 10],
  });
  return ((result as unknown as Page<Milestone>).items ?? []);
}

export async function fetchAccounting(): Promise<{
  grant_escrow: string | number;
  total_released: string | number;
  total_refunded: string | number;
  treasury_balance: string | number;
  claimable_escrow: string | number;
  owner: string;
}> {
  const result = await readClient().readContract({
    address: activeContractAddress(),
    functionName: "get_accounting",
    args: [],
  });
  return result as unknown as {
    grant_escrow: string | number;
    total_released: string | number;
    total_refunded: string | number;
    treasury_balance: string | number;
    claimable_escrow: string | number;
    owner: string;
  };
}

export async function fetchClaimableBalance(account: string): Promise<string> {
  const result = await readClient().readContract({
    address: activeContractAddress(),
    functionName: "get_claimable",
    args: [account],
  });
  return String(result ?? "0");
}

export async function fetchEvaluationPolicy(): Promise<{ constitution: string; caps: Record<string, string | number> }> {
  const client = readClient();
  const address = activeContractAddress();
  const [constitution, caps] = await Promise.all([
    client.readContract({ address, functionName: "get_constitution", args: [] }),
    client.readContract({ address, functionName: "get_tier_caps", args: [] }),
  ]);
  return { constitution: String(constitution), caps: caps as Record<string, string | number> };
}

export class PendingTransactionError extends Error {
  readonly hash: `0x${string}`;
  constructor(hash: `0x${string}`, cause?: unknown) {
    super("The transaction was submitted. Finalization is still pending; track this hash before trying again.",
      cause === undefined ? undefined : { cause });
    this.name = "PendingTransactionError";
    this.hash = hash;
  }
}

export class FailedTransactionError extends Error {
  readonly hash: `0x${string}`;
  constructor(hash: `0x${string}`, status: string, execution: string) {
    super(`Transaction finalized without a successful contract execution (${status} / ${execution}).`);
    this.name = "FailedTransactionError";
    this.hash = hash;
  }
}

export async function trackTransaction(hash: `0x${string}`): Promise<void> {
  const receipt = await readClient().waitForFinalization({
    hash: hash as Hash,
    interval: 3000,
    retries: 40,
  });
  if (!isSuccessful(receipt)) {
    throw new FailedTransactionError(
      hash,
      String(receipt.statusName),
      String(receipt.txExecutionResultName),
    );
  }
}

export async function writeContractAction(
  account: string,
  functionName: string,
  args: unknown[],
  value?: bigint,
): Promise<`0x${string}`> {
  const client = writeClient(account);
  const call = {
    address: activeContractAddress(),
    functionName,
    args,
    ...(value === undefined ? {} : { value }),
  };
  const quote = await client.estimateTransactionFeesForWrite(call as never);
  const txHash = await client.writeContract({
    ...call,
    fees: { distribution: quote.distribution, feeValue: quote.feeValue },
  } as never) as `0x${string}`;

  try {
    await trackTransaction(txHash);
  } catch (error) {
    if (error instanceof FailedTransactionError) throw error;
    throw new PendingTransactionError(txHash, error);
  }
  return txHash;
}

export async function createGrant(
  account: string,
  title: string,
  repositoryUrl: string,
  recipient: string,
  milestones: MilestoneDraft[],
): Promise<`0x${string}`> {
  const payload = milestones.map((milestone) => ({
    title: milestone.title.trim(),
    criteria: milestone.criteria.trim(),
    amount: toAttoAmount(milestone.amount).toString(),
    deadline: milestone.deadline,
  }));
  return writeContractAction(
    account,
    "create_grant",
    [title.trim(), repositoryUrl.trim(), recipient.trim(), JSON.stringify(payload)],
  );
}

export async function fundGrant(account: string, grantId: string) {
  return writeContractAction(account, "fund_grant", [grantId]);
}

export async function depositToTreasury(account: string, amount: string) {
  return writeContractAction(account, "deposit", [], toAttoAmount(amount));
}

export async function withdrawFunds(account: string) {
  return writeContractAction(account, "withdraw", []);
}

export async function evaluateGrant(account: string, grantId: string) {
  return writeContractAction(account, "evaluate_grant", [grantId]);
}

export async function submitEvidence(account: string, grantId: string, evidenceUrl: string) {
  return writeContractAction(account, "submit_evidence", [grantId, evidenceUrl.trim()]);
}

export async function adjudicate(account: string, grantId: string) {
  return writeContractAction(account, "adjudicate", [grantId]);
}

export async function releaseTranche(account: string, grantId: string) {
  return writeContractAction(account, "release_tranche", [grantId]);
}

export async function expireMilestone(account: string, grantId: string) {
  return writeContractAction(account, "expire_current_milestone", [grantId]);
}

export async function refundUnearned(account: string, grantId: string) {
  return writeContractAction(account, "refund_unearned", [grantId]);
}

export async function cancelDraft(account: string, grantId: string) {
  return writeContractAction(account, "cancel_draft", [grantId]);
}
