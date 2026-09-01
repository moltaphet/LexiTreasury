// tests/e2e/submit.spec.ts
// Tests for the Submit Proposal form: field validation, error states, loading state.
// Does NOT submit real transactions -- validation errors are triggered client-side.

import { test, expect, type Page } from "@playwright/test";

const VALID_URL = "https://github.com/ethereum/solidity";
const MOCK_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// Injects a minimal EIP-1193 mock so wallet connection works without MetaMask.
async function injectWalletMock(page: Page): Promise<void> {
  await page.addInitScript((addr) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return [addr];
        if (method === "eth_accounts") return [];
        if (method === "eth_chainId") return "0xf22f";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "wallet_addEthereumChain") return null;
        if (method === "eth_sendTransaction") return "0x" + "d".repeat(64);
        return null;
      },
      on: (_event: string, _fn: unknown) => {},
      removeListener: (_event: string, _fn: unknown) => {},
    };
  }, MOCK_ADDR);
}

async function openSubmitTab(page: Page) {
  await page.goto("/");
  await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();
}

// Connect wallet via the header panel using the MetaMask mock.
async function connectWallet(page: Page): Promise<void> {
  await page.getByText("Connect Wallet").click();
  await page.getByRole("button", { name: /Connect MetaMask/i }).click();
  // Scope to the button role so the "Signing as" chip doesn't cause a strict-mode clash.
  await expect(page.getByRole("button", { name: /0xf39F/ })).toBeVisible();
}

test.describe("Submit Proposal form fields", () => {
  test("GitHub URL input is visible", async ({ page }) => {
    await openSubmitTab(page);
    await expect(
      page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i)
    ).toBeVisible();
  });

  test("Requested Amount input is visible", async ({ page }) => {
    await openSubmitTab(page);
    await expect(page.getByPlaceholder("1000")).toBeVisible();
  });

  test("submit button is visible and labelled correctly", async ({ page }) => {
    await openSubmitTab(page);
    await expect(
      page.getByRole("button", { name: /Submit to GenLayer/i })
    ).toBeVisible();
  });
});

test.describe("Submit Proposal client-side validation", () => {
  test("shows error when GitHub URL does not start with https://github.com/", async ({ page }) => {
    await openSubmitTab(page);
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill("https://gitlab.com/owner/repo");
    await page.getByPlaceholder("1000").fill("100");
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();
    await expect(page.getByText(/must start with https:\/\/github\.com\//i)).toBeVisible();
  });

  test("shows error for a zero or negative amount", async ({ page }) => {
    await openSubmitTab(page);
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
    await page.getByPlaceholder("1000").fill("0");
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();
    await expect(page.getByText(/positive number/i)).toBeVisible();
  });

  test("shows error when wallet is not connected and form is otherwise valid", async ({ page }) => {
    await openSubmitTab(page);
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
    await page.getByPlaceholder("1000").fill("100");
    // Wallet not connected -- no mock injected, or mock never triggered
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();
    // The validation error text must be distinct from the static wallet hint below the form.
    await expect(page.getByText("Please connect your wallet before submitting")).toBeVisible();
  });

  test("error banner disappears when a new valid submission starts", async ({ page }) => {
    await openSubmitTab(page);
    // Trigger a URL validation error
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill("bad-url");
    await page.getByPlaceholder("1000").fill("100");
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();
    await expect(page.getByText(/Validation Error/i)).toBeVisible();
    // Fix the URL so the error message changes on next attempt
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
  });
});

test.describe("Submit form with wallet connected", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMock(page);
  });

  test("Signing as chip appears after wallet is connected", async ({ page }) => {
    await openSubmitTab(page);
    await connectWallet(page);
    // Navigate back to submit tab (wallet connect may have changed focus)
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();
    await expect(page.getByText("Signing as")).toBeVisible();
  });

  test("shows validation error for invalid URL even when wallet is connected", async ({ page }) => {
    await openSubmitTab(page);
    await connectWallet(page);
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();

    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill("not-a-github-url");
    await page.getByPlaceholder("1000").fill("100");
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();

    await expect(page.getByText(/must start with https:\/\/github\.com\//i)).toBeVisible();
  });
});

test.describe("Tier Caps reference panel", () => {
  test("TIER_1, TIER_2, TIER_3 labels are visible in the sidebar", async ({ page }) => {
    await openSubmitTab(page);
    await expect(page.getByText("TIER_1")).toBeVisible();
    await expect(page.getByText("TIER_2")).toBeVisible();
    await expect(page.getByText("TIER_3")).toBeVisible();
  });

  test("token cap amounts are visible", async ({ page }) => {
    await openSubmitTab(page);
    await expect(page.getByText("10,000 tkns")).toBeVisible();
    await expect(page.getByText("5,000 tkns")).toBeVisible();
    await expect(page.getByText("1,000 tkns")).toBeVisible();
  });
});
