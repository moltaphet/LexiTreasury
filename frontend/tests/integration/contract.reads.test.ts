/** SDK boundary checks. All RPC responses are mocked; no network is contacted. */
import { CONTRACT_ADDRESS, EXPLORER_URL, fetchAccounting, fetchGrantPage, fetchMilestones } from "@/lib/contract";
import { studioDevnet } from "genlayer-js/chains";
import deployment from "@/config/studio-dev-deployment.json";
import { createClient } from "genlayer-js";

jest.mock("genlayer-js", () => ({ createClient: jest.fn(), isSuccessful: jest.fn(() => true) }));

describe("Studio Dev contract reads", () => {
  const readContract = jest.fn();
  beforeEach(() => { readContract.mockReset(); (createClient as jest.Mock).mockReturnValue({ readContract }); });

  test("active deployment config matches the SDK Studio Dev preset", () => {
    expect(CONTRACT_ADDRESS).toBe(deployment.contract_address);
    expect(EXPLORER_URL).toBe(`${deployment.explorer_base_url}address/${deployment.contract_address}`);
    expect(studioDevnet.id).toBe(deployment.chain_id);
    expect(studioDevnet.rpcUrls.default.http[0]).toBe(deployment.rpc_url);
    expect(deployment.constructor_args.allow_demo_owner_payout).toBe(false);
  });

  test("requests a bounded grant page with the caller's offset", async () => {
    const page = { items: [], offset: 20, limit: 20, total: 35, has_more: false };
    readContract.mockResolvedValue(page);
    await expect(fetchGrantPage(20)).resolves.toEqual(page);
    expect(readContract).toHaveBeenCalledWith({ address: CONTRACT_ADDRESS, functionName: "get_grants", args: [20, 20] });
  });

  test("uses the contract's ten-milestone page limit", async () => {
    readContract.mockResolvedValue({ items: [], offset: 0, limit: 10, total: 0, has_more: false });
    await expect(fetchMilestones("grant-1")).resolves.toEqual([]);
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "get_milestones", args: ["grant-1", 0, 10] }));
  });

  test("reads accounting totals", async () => {
    const accounting = { grant_escrow: "1", total_released: "2", total_refunded: "3", treasury_balance: "4", claimable_escrow: "5", owner: "0x1111111111111111111111111111111111111111" };
    readContract.mockResolvedValue(accounting);
    await expect(fetchAccounting()).resolves.toEqual(accounting);
  });
});
