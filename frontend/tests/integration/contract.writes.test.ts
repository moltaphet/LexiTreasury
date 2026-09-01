// tests/integration/contract.writes.test.ts
// Integration tests for submitProposal against the LIVE StudioNet contract.
//
// These tests are SKIPPED automatically when TEST_PRIVATE_KEY is not set.
// To run them, export a StudioNet testnet private key first:
//
//   export TEST_PRIVATE_KEY=0x<your-studionet-private-key>
//   npm run test:integration
//
// StudioNet is gasless, so no GEN tokens are required.
// The test submits a proposal for a well-known public repository.

import { submitProposal, fetchAllProposals } from "@/lib/contract";

const TEST_KEY = process.env.TEST_PRIVATE_KEY as `0x${string}` | undefined;
const TEST_REPO = "https://github.com/ethereum/solidity";

const skipWithoutKey = TEST_KEY ? describe : describe.skip;

skipWithoutKey("submitProposal (live StudioNet, requires TEST_PRIVATE_KEY)", () => {
  jest.setTimeout(120_000);

  let submittedTxHash: string;

  test("returns a 0x-prefixed transaction hash for a valid submission", async () => {
    const txHash = await submitProposal(TEST_REPO, 100, TEST_KEY!);
    expect(typeof txHash).toBe("string");
    expect(txHash.startsWith("0x")).toBe(true);
    expect(txHash.length).toBeGreaterThanOrEqual(66);
    submittedTxHash = txHash;
    console.log(`Submitted proposal tx: ${txHash}`);
  });

  test("proposal eventually appears in fetchAllProposals", async () => {
    if (!submittedTxHash) {
      console.warn("Skipping appearance check: previous submit test did not run or failed.");
      return;
    }
    // Wait up to 60 s for the proposal to appear (validator processing lag)
    let found = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const proposals = await fetchAllProposals();
      found = proposals.some((p) => p.github_url === TEST_REPO);
      if (found) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Throws when no injected wallet is present (no window.ethereum in Jest)
// ---------------------------------------------------------------------------
describe("submitProposal input validation", () => {
  test("throws when no wallet provider is available", async () => {
    await expect(
      submitProposal(TEST_REPO, 100, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
    ).rejects.toThrow(/wallet|ethereum/i);
  });
});
