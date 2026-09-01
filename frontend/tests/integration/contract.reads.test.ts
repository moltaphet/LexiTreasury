// tests/integration/contract.reads.test.ts
// Integration tests that call the LIVE contract on GenLayer StudioNet.
// Requires network access to https://studio.genlayer.com
//
// Run with:
//   npm run test:integration
//
// These tests have a 60-second timeout to tolerate StudioNet latency.

import {
  fetchConstitution,
  fetchTierCaps,
  fetchAllProposals,
  type Proposal,
  type TierCaps,
} from "@/lib/contract";

const PROPOSAL_FIELDS: (keyof Proposal)[] = [
  "proposal_id",
  "github_url",
  "applicant",
  "requested_amount",
  "status",
  "tier",
  "allocated_amount",
];

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "FUNDED"]);

// ---------------------------------------------------------------------------
// Constitution
// ---------------------------------------------------------------------------
describe("fetchConstitution (live StudioNet)", () => {
  jest.setTimeout(60_000);

  test("returns a non-empty string", async () => {
    const constitution = await fetchConstitution();
    expect(typeof constitution).toBe("string");
    expect(constitution.length).toBeGreaterThan(0);
  });

  test("mentions expected governance vocabulary", async () => {
    const constitution = await fetchConstitution();
    // The constitution should reference concepts like license, audit, or commit
    const lower = constitution.toLowerCase();
    const hasKeyword =
      lower.includes("license") ||
      lower.includes("audit") ||
      lower.includes("commit") ||
      lower.includes("approve");
    expect(hasKeyword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier caps
// ---------------------------------------------------------------------------
describe("fetchTierCaps (live StudioNet)", () => {
  jest.setTimeout(60_000);

  test("returns an object with TIER_1, TIER_2, TIER_3 keys", async () => {
    const caps: TierCaps = await fetchTierCaps();
    expect(caps).toHaveProperty("TIER_1");
    expect(caps).toHaveProperty("TIER_2");
    expect(caps).toHaveProperty("TIER_3");
  });

  test("tier cap values are numeric strings", async () => {
    const caps: TierCaps = await fetchTierCaps();
    for (const key of ["TIER_1", "TIER_2", "TIER_3"] as const) {
      expect(() => BigInt(caps[key])).not.toThrow();
    }
  });

  test("TIER_1 cap is greater than TIER_2, TIER_2 greater than TIER_3", async () => {
    const caps: TierCaps = await fetchTierCaps();
    const t1 = BigInt(caps.TIER_1);
    const t2 = BigInt(caps.TIER_2);
    const t3 = BigInt(caps.TIER_3);
    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(t3);
    expect(t3).toBeGreaterThan(BigInt(0));
  });
});

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------
describe("fetchAllProposals (live StudioNet)", () => {
  jest.setTimeout(60_000);

  test("returns an array", async () => {
    const proposals = await fetchAllProposals();
    expect(Array.isArray(proposals)).toBe(true);
  });

  test("each proposal has required fields", async () => {
    const proposals = await fetchAllProposals();
    for (const p of proposals) {
      for (const field of PROPOSAL_FIELDS) {
        expect(p).toHaveProperty(field);
      }
    }
  });

  test("each proposal status is one of the known values", async () => {
    const proposals = await fetchAllProposals();
    for (const p of proposals) {
      expect(VALID_STATUSES.has(p.status)).toBe(true);
    }
  });

  test("each proposal applicant looks like an address", async () => {
    const proposals = await fetchAllProposals();
    for (const p of proposals) {
      if (p.applicant) {
        expect(p.applicant.startsWith("0x")).toBe(true);
      }
    }
  });
});
