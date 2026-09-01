// tests/unit/helpers.test.ts
// Pure unit tests for lib/contract.ts helper functions.
// No network calls -- these run in milliseconds.

import { attoToTokens, shortenAddress, shortenUrl } from "@/lib/contract";

// ---------------------------------------------------------------------------
// attoToTokens
// ---------------------------------------------------------------------------
describe("attoToTokens", () => {
  test("converts 1 token (1e18 atto) to '1'", () => {
    expect(attoToTokens("1000000000000000000")).toBe("1");
  });

  test("converts 10000 tokens (1e22 atto) to a string containing 10000", () => {
    const result = attoToTokens("10000000000000000000000");
    // Strip locale separators before comparing to handle e.g. "10,000" vs "10 000"
    expect(result.replace(/[^0-9]/g, "")).toBe("10000");
  });

  test("converts 0 atto to '0'", () => {
    expect(attoToTokens("0")).toBe("0");
  });

  test("returns '0' for an empty string", () => {
    expect(attoToTokens("")).toBe("0");
  });

  test("returns '0' for a non-numeric string", () => {
    expect(attoToTokens("not-a-number")).toBe("0");
  });

  test("handles very large values without throwing", () => {
    const result = attoToTokens("99999999000000000000000000");
    expect(typeof result).toBe("string");
  });

  test("truncates fractional tokens (integer division)", () => {
    // 1.5 tokens in atto = 1500000000000000000; floor division gives 1
    expect(attoToTokens("1500000000000000000")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// shortenAddress
// ---------------------------------------------------------------------------
describe("shortenAddress", () => {
  const FULL = "0x141FFe84339FA98E0237076B6f6a3262ce49c109";

  test("returns 'start...end' for a standard 42-char address", () => {
    expect(shortenAddress(FULL)).toBe("0x141F...c109");
  });

  test("returns the original string for addresses shorter than 10 chars", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });

  test("returns empty string for empty input", () => {
    expect(shortenAddress("")).toBe("");
  });

  test("preserves case in both segments", () => {
    const result = shortenAddress(FULL);
    expect(result.startsWith("0x141F")).toBe(true);
    expect(result.endsWith("c109")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shortenUrl
// ---------------------------------------------------------------------------
describe("shortenUrl", () => {
  test("strips scheme and host, removes leading slash", () => {
    expect(shortenUrl("https://github.com/owner/repo")).toBe("owner/repo");
  });

  test("handles nested paths", () => {
    expect(shortenUrl("https://github.com/org/repo/tree/main")).toBe(
      "org/repo/tree/main"
    );
  });

  test("returns the original string for an invalid URL", () => {
    expect(shortenUrl("not-a-url")).toBe("not-a-url");
  });

  test("returns the original string for an empty input", () => {
    expect(shortenUrl("")).toBe("");
  });

  test("handles root path '/'", () => {
    // URL('https://example.com/').pathname is '/'
    // After stripping leading slash the result is ''
    expect(shortenUrl("https://example.com/")).toBe("");
  });
});
