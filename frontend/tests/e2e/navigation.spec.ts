import { test, expect } from "@playwright/test";
import { abi } from "genlayer-js";
import deployment from "../../config/studio-dev-deployment.json";

const contractAddress = deployment.contract_address;
const contractLinkName = `Contract ${contractAddress.slice(0, 6)}…${contractAddress.slice(-4)} ↗`;
const contractExplorerUrl = `${deployment.explorer_base_url}address/${contractAddress}`;

test("milestone grant dashboard identifies the active Studio Next deployment", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/LexiTreasury/i);
  await expect(page.getByRole("heading", { name: /Fund the work.*Release it in stages/i })).toBeVisible();
  await expect(page.getByRole("note").getByText(/GenLayer Studio Dev \/ Studio Next preview.*Chain 61997/i)).toBeVisible();
  const contractLink = page.getByRole("link", { name: contractLinkName });
  await expect(contractLink).toBeVisible();
  await expect(contractLink).toHaveAttribute("href", contractExplorerUrl);
  await expect(page.getByRole("button", { name: /Connect wallet/i })).toBeVisible();
});

test("grant tabs open creation form without contacting the chain", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Create grant/i }).click();
  await expect(page.getByRole("heading", { name: /Make the finish line visible/i })).toBeVisible();
  await expect(page.getByLabel(/GitHub repository/i)).toBeVisible();
});

test("configured deployment is linked and no longer reports a missing address", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: contractLinkName })).toHaveAttribute("href", contractExplorerUrl);
  await expect(page.getByRole("alert").filter({ hasText: /has not been deployed or configured/i })).toHaveCount(0);
});

test("loading later grant pages retains the ledger and makes later user grants visible in My activity", async ({ page }) => {
  const account = "0x2222222222222222222222222222222222222222";
  await page.addInitScript((address) => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
          if (method === "eth_chainId") return "0xf22d";
          return null;
        },
        on: () => {},
        removeListener: () => {},
      },
    });
  }, account);

  let grantPageReads = 0;
  const other = "0x1111111111111111111111111111111111111111";
  const grant = (index: number, mine = false) => ({
    grant_id: `grant_${index}`,
    title: `Pagination Grant ${index}`,
    repository_url: "https://github.com/acme/project",
    funder: other,
    applicant: mine ? account : other,
    recipient: mine ? account : other,
    status: "DRAFT",
    milestone_count: 1,
    current_index: 0,
    total_amount: "1000000000000000000",
    remaining_amount: "1000000000000000000",
    released_amount: "0",
    refunded_amount: "0",
    tier: "TIER_3",
    allocated_amount: "1000000000000000000",
    evaluation_decision: "",
    evaluation_reasoning: "",
    maintainer_verified: "false",
    maintainer_login: "",
    commit_bracket: "NONE",
    contributor_bracket: "CONTRIB_NONE",
    quality_bracket: "QUALITY_NONE",
    license_spdx: "MIT",
    is_osi_approved: "true",
    has_audit: "false",
    audit_uid: "",
  });
  const encode = (value: unknown) => `0x${Buffer.from(abi.calldata.encode(value as never)).toString("hex")}`;
  await page.route(deployment.rpc_url, async (route) => {
    const request = route.request().postDataJSON() as { method?: string; params?: Array<{ data?: string }> };
    if (request.method === "eth_chainId") {
      await route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: "0xf22d" } });
      return;
    }
    if (request.method === "gen_call") {
      const encodedCall = request.params?.[0]?.data ?? "";
      const methodName = (name: string) => Buffer.from(name).toString("hex");
      let value: unknown;
      if (encodedCall.includes(methodName("get_grants"))) {
        grantPageReads += 1;
        value = grantPageReads === 1
          ? { items: Array.from({ length: 20 }, (_, index) => grant(index + 1)), offset: 0, limit: 20, total: 21, has_more: true }
          : grantPageReads === 2
            ? { items: [grant(21, true)], offset: 20, limit: 20, total: 21, has_more: false }
            : { items: Array.from({ length: 20 }, (_, index) => grant(index + 1)), offset: 0, limit: 20, total: 21, has_more: true };
      } else if (encodedCall.includes(methodName("get_accounting"))) {
        value = { grant_escrow: "0", total_released: "0", total_refunded: "0", treasury_balance: "0", claimable_escrow: "0", owner: other };
      } else if (encodedCall.includes(methodName("get_constitution"))) {
        value = "Open source work with verifiable milestones.";
      } else if (encodedCall.includes(methodName("get_tier_caps"))) {
        value = { TIER_1: "1000000000000000000000", TIER_2: "500000000000000000000", TIER_3: "100000000000000000000" };
      } else if (encodedCall.includes(methodName("get_claimable"))) {
        value = "0";
      } else {
        throw new Error(`Unexpected read-only test call: ${encodedCall}`);
      }
      await route.fulfill({ json: { jsonrpc: "2.0", id: 1, result: encode(value) } });
      return;
    }
    throw new Error(`Unexpected RPC method: ${request.method}`);
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "0x2222…2222" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pagination Grant 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more grants" }).click();
  await expect(page.getByRole("heading", { name: "Pagination Grant 21", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pagination Grant 1", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /My activity/i }).click();
  await expect(page.getByRole("heading", { name: "Pagination Grant 21", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pagination Grant 1", exact: true })).toHaveCount(0);
});
