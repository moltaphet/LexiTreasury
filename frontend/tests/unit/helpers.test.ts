// tests/unit/helpers.test.ts
// Pure unit tests for lib/contract.ts helper functions.
// No network calls -- these run in milliseconds.

import { formatGen, toAttoAmount } from "@/lib/contract";

// ---------------------------------------------------------------------------
// attoToTokens
// ---------------------------------------------------------------------------
describe("GEN amount formatting", () => {
  test("formats exact atto amounts without floating point rounding", () => {
    expect(formatGen("1000000000000000000")).toBe("1");
    expect(formatGen("1234567890123456789")).toBe("1.234567890123456789");
    expect(formatGen("0")).toBe("0");
  });

  test("converts decimal GEN input to an exact integer amount", () => {
    expect(toAttoAmount("1.25")).toBe(1250000000000000000n);
    expect(toAttoAmount("0.000000000000000001")).toBe(1n);
  });

  test.each(["", "-1", "1e3", "1.0000000000000000001", "0", "01"]) (
    "rejects invalid or zero input %s",
    (value) => expect(() => toAttoAmount(value)).toThrow(),
  );
  test("rejects malformed atto output", () => {
    expect(() => formatGen("not-an-integer")).toThrow();
  });
});
