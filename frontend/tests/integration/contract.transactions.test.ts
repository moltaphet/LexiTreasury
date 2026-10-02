/** Transaction handling tests use an injected mock provider and never send a real transaction. */
import { createClient, isSuccessful } from "genlayer-js";
import { FailedTransactionError, PendingTransactionError, trackTransaction, writeContractAction } from "@/lib/contract";

jest.mock("genlayer-js", () => ({ createClient: jest.fn(), isSuccessful: jest.fn(() => true) }));
const hash = `0x${"a".repeat(64)}` as `0x${string}`;

describe("transaction finalization handling", () => {
  const estimateTransactionFeesForWrite = jest.fn();
  const writeContract = jest.fn();
  const waitForFinalization = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue({ estimateTransactionFeesForWrite, writeContract, waitForFinalization });
    estimateTransactionFeesForWrite.mockResolvedValue({ gasless: false, distribution: {}, feeValue: 12n });
    writeContract.mockResolvedValue(hash);
    waitForFinalization.mockResolvedValue({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" });
    (isSuccessful as jest.Mock).mockReturnValue(true);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: {} } });
  });

  test("estimates fees, submits, then waits for successful finalization", async () => {
    await expect(writeContractAction("0x2222222222222222222222222222222222222222", "cancel_draft", ["g"])).resolves.toBe(hash);
    expect(estimateTransactionFeesForWrite).toHaveBeenCalled();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ fees: { distribution: {}, feeValue: 12n } }));
    expect(waitForFinalization).toHaveBeenCalledWith(expect.objectContaining({ hash, interval: 3000, retries: 40 }));
  });

  test("reports final execution failure", async () => {
    (isSuccessful as jest.Mock).mockReturnValue(false);
    await expect(trackTransaction(hash)).rejects.toBeInstanceOf(FailedTransactionError);
  });

  test("retains the hash when finalization times out to prevent duplicate writes", async () => {
    waitForFinalization.mockRejectedValue(new Error("timeout"));
    await expect(writeContractAction("0x2222222222222222222222222222222222222222", "cancel_draft", ["g"]))
      .rejects.toMatchObject({ constructor: PendingTransactionError, hash });
  });
});
