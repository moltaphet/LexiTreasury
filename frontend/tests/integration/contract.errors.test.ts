// tests/integration/contract.errors.test.ts
// Tests for error-handling paths in lib/contract.ts.
// Mix of offline (argument-validation) and online (RPC-level) checks.

import { fetchConstitution, fetchTierCaps, fetchAllProposals, submitProposal } from "@/lib/contract";

// ---------------------------------------------------------------------------
// Argument / format errors -- no network required
// ---------------------------------------------------------------------------
describe("submitProposal argument errors (offline)", () => {
  test("rejects a key that is too short (not 66 chars)", async () => {
    await expect(
      submitProposal("https://github.com/a/b", 1, "0xabc" as `0x${string}`)
    ).rejects.toThrow();
  });

  test("rejects a key that is all zeros", async () => {
    const zeroKey = ("0x" + "0".repeat(64)) as `0x${string}`;
    await expect(
      submitProposal("https://github.com/a/b", 1, zeroKey)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Network error simulation via patched createClient
// Tests that errors propagate up rather than being silently swallowed.
// ---------------------------------------------------------------------------
describe("fetchConstitution error propagation", () => {
  jest.setTimeout(30_000);

  test("rejects with an Error instance on RPC failure", async () => {
    // Temporarily replace genlayer-js createClient to simulate an RPC error
    const genlayerJs = require("genlayer-js");
    const original = genlayerJs.createClient;

    genlayerJs.createClient = () => ({
      readContract: async () => { throw new Error("Simulated RPC timeout"); },
    });

    try {
      await expect(fetchConstitution()).rejects.toMatchObject({
        message: expect.stringContaining("Simulated RPC timeout"),
      });
    } finally {
      // Always restore the original to avoid leaking into other tests
      genlayerJs.createClient = original;
    }
  });

  test("rejects with an Error instance on fetchTierCaps RPC failure", async () => {
    const genlayerJs = require("genlayer-js");
    const original = genlayerJs.createClient;

    genlayerJs.createClient = () => ({
      readContract: async () => { throw new Error("Network unreachable"); },
    });

    try {
      await expect(fetchTierCaps()).rejects.toMatchObject({
        message: expect.stringContaining("Network unreachable"),
      });
    } finally {
      genlayerJs.createClient = original;
    }
  });

  test("rejects with an Error instance on fetchAllProposals RPC failure", async () => {
    const genlayerJs = require("genlayer-js");
    const original = genlayerJs.createClient;

    genlayerJs.createClient = () => ({
      readContract: async () => { throw new Error("503 Service Unavailable"); },
    });

    try {
      await expect(fetchAllProposals()).rejects.toMatchObject({
        message: expect.stringContaining("503"),
      });
    } finally {
      genlayerJs.createClient = original;
    }
  });
});
