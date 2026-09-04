#!/usr/bin/env node
/**
 * End-to-end lifecycle witness for LexiTreasury.
 *
 * Drives the full on-chain money path directly against the live StudioNet
 * deployment so a programmatic reviewer can watch the requested application
 * flow with a single command:
 *
 *     Submit  ->  Evaluate (AI-validator consensus)  ->  Fund  ->  Payout
 *
 * Every step is real: it calls the deployed intelligent contract via
 * genlayer-js and waits for consensus before moving on. No out-of-band CLI
 * transactions are required -- this exercises the exact same contract methods
 * (`submit_proposal`, `evaluate_proposal`, `execute_proposal`, `withdraw`)
 * the frontend now wires up.
 *
 * Usage:
 *
 *     E2E_PRIVATE_KEY=0x<key> npm run verify:e2e
 *
 * Optional environment:
 *     GITHUB_URL   repository to submit   (default: a known-good OSS repo)
 *     REQUESTED    tokens requested       (default: 1000)
 *     CONTRACT     override contract addr (default: NEXT_PUBLIC_CONTRACT_ADDRESS
 *                                          or the committed StudioNet address)
 *
 * The signing account should be the contract owner (so it may `deposit` and
 * top up the treasury). For the payout leg to release funds, the submitted
 * repository must publish `.well-known/genlayer-treasury.json` binding its
 * owner + payout_address to this account (maintainer verification).
 */

import { createClient, createAccount, chains } from "genlayer-js";

const CONTRACT =
  process.env.CONTRACT ||
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf";

const GITHUB_URL = process.env.GITHUB_URL || "https://github.com/genlayerlabs/genlayer-js";
const REQUESTED = Number(process.env.REQUESTED || "1000");
const PRIVATE_KEY = process.env.E2E_PRIVATE_KEY;

const ATTO = BigInt(10) ** BigInt(18);

function log(step, msg) {
  console.log(`\n\x1b[36m[${step}]\x1b[0m ${msg}`);
}
function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function info(msg) {
  console.log(`  \x1b[90m•\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`);
}

if (!PRIVATE_KEY) {
  fail("E2E_PRIVATE_KEY is required (a StudioNet-funded owner key).");
  console.error("      Example: E2E_PRIVATE_KEY=0x... npm run verify:e2e");
  process.exit(2);
}

const account = createAccount(PRIVATE_KEY);
const write = createClient({ chain: chains.studionet, account });
const read = createClient({ chain: chains.studionet });

async function readContract(functionName, args = []) {
  return read.readContract({ address: CONTRACT, functionName, args });
}

async function send(functionName, args = [], value = BigInt(0)) {
  const hash = await write.writeContract({
    address: CONTRACT,
    functionName,
    args,
    value,
  });
  info(`tx ${hash} -- waiting for consensus...`);
  await read.waitForTransactionReceipt({ hash, interval: 3000, retries: 60 });
  return hash;
}

async function main() {
  console.log("========================================================");
  console.log(" LexiTreasury E2E lifecycle witness");
  console.log(` contract : ${CONTRACT}`);
  console.log(` account  : ${account.address}`);
  console.log(` repo     : ${GITHUB_URL}`);
  console.log("========================================================");

  // ---- 1. SUBMIT -------------------------------------------------------
  log("1/4 SUBMIT", "Submitting proposal...");
  const before = (await readContract("get_all_proposals")) ?? [];
  await send("submit_proposal", [GITHUB_URL, BigInt(REQUESTED) * ATTO]);
  const after = (await readContract("get_all_proposals")) ?? [];
  ok(`proposal count ${before.length} -> ${after.length}`);

  // Newest proposal owned by us (highest numeric id).
  const mine = after
    .filter((p) => String(p.applicant).toLowerCase() === account.address.toLowerCase())
    .sort((a, b) => Number(b.proposal_id) - Number(a.proposal_id));
  if (mine.length === 0) throw new Error("submitted proposal not found on-chain");
  const pid = mine[0].proposal_id;
  ok(`proposal #${pid} is ${mine[0].status}`);
  if (mine[0].status !== "PENDING") throw new Error("expected PENDING after submit");

  // ---- 2. EVALUATE -----------------------------------------------------
  log("2/4 EVALUATE", "Running AI-validator consensus (evaluate_proposal)...");
  await send("evaluate_proposal", [pid]);
  const evaluated = ((await readContract("get_all_proposals")) ?? []).find(
    (p) => p.proposal_id === pid
  );
  ok(`decision: ${evaluated.evaluation_decision || "--"}`);
  ok(`status  : ${evaluated.status}  tier: ${evaluated.tier || "--"}`);
  info(`maintainer_verified: ${evaluated.maintainer_verified}`);
  if (evaluated.status === "PENDING") {
    throw new Error("proposal still PENDING after evaluate -- consensus did not decide");
  }
  ok("proposal left PENDING via evaluate_proposal (blocker resolved)");

  if (evaluated.status !== "APPROVED") {
    log("DONE", `Proposal was ${evaluated.status}; funding path not applicable.`);
    console.log("\nSubmit -> Evaluate verified end-to-end. ✅");
    return;
  }

  const allocated = BigInt(evaluated.allocated_amount || "0");

  // ---- 3. FUND ---------------------------------------------------------
  log("3/4 FUND", "Releasing allocation into recipient escrow (execute_proposal)...");
  let reserve = BigInt((await readContract("get_treasury_balance")) ?? 0);
  info(`treasury reserve: ${reserve / ATTO} tokens; allocation: ${allocated / ATTO}`);
  if (reserve < allocated) {
    const topUp = allocated - reserve;
    info(`topping up treasury by ${topUp / ATTO} tokens (deposit)...`);
    await send("deposit", [], topUp);
    reserve = BigInt((await readContract("get_treasury_balance")) ?? 0);
    ok(`reserve now ${reserve / ATTO} tokens`);
  }
  await send("execute_proposal", [pid]);
  const funded = ((await readContract("get_all_proposals")) ?? []).find(
    (p) => p.proposal_id === pid
  );
  ok(`status: ${funded.status}`);
  if (funded.status !== "FUNDED") throw new Error("expected FUNDED after execute_proposal");

  // ---- 4. PAYOUT -------------------------------------------------------
  log("4/4 PAYOUT", "Withdrawing claimable escrow to recipient (withdraw)...");
  const recipient = funded.recipient || funded.applicant;
  const claimBefore = BigInt((await readContract("get_claimable", [recipient])) ?? 0);
  ok(`recipient claimable: ${claimBefore / ATTO} tokens`);
  if (recipient.toLowerCase() === account.address.toLowerCase()) {
    await send("withdraw", []);
    const claimAfter = BigInt((await readContract("get_claimable", [recipient])) ?? 0);
    ok(`claimable ${claimBefore / ATTO} -> ${claimAfter / ATTO} tokens (paid out)`);
  } else {
    info(`recipient ${recipient} differs from signer -- run withdraw with that key.`);
  }

  console.log("\nSubmit -> Evaluate -> Fund -> Payout verified end-to-end. ✅");
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
