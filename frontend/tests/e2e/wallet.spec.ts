// tests/e2e/wallet.spec.ts
// Tests the Connect Wallet panel in the header: open, connect via MetaMask mock, disconnect.

import { test, expect, type Page } from "@playwright/test";

const MOCK_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// Injects a minimal EIP-1193 mock into the page before navigation.
// eth_accounts returns [] so there is no auto-connect on mount.
// eth_requestAccounts returns the mock address (simulates MetaMask approval).
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

// Click "Connect MetaMask" in the already-open panel and wait for the header address button.
async function completeConnect(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Connect MetaMask/i }).click();
  // Scope to the button role so the "Signing as" chip in the Submit tab doesn't cause a clash.
  await expect(page.getByRole("button", { name: /0xf39F/ })).toBeVisible();
}

test.describe("Wallet Connect Panel", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMock(page);
    await page.goto("/");
  });

  test("Connect Wallet button opens the panel", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await expect(page.getByText("Connect MetaMask")).toBeVisible();
  });

  test("panel closes when Cancel is clicked", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Connect MetaMask")).not.toBeVisible();
  });

  test("connecting via MetaMask shows address in header", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await completeConnect(page);
    await expect(page.getByText("Connect Wallet")).not.toBeVisible();
    await expect(page.getByText("0xf39F")).toBeVisible();
  });

  test("disconnecting returns the header to the Connect Wallet state", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await completeConnect(page);

    // Open account dropdown and disconnect
    await page.getByText("0xf39F").click();
    await page.getByRole("button", { name: "Disconnect" }).click();

    await expect(page.getByText("Connect Wallet")).toBeVisible();
  });

  test("connected wallet shows full address in dropdown", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await completeConnect(page);

    // Open account dropdown
    await page.getByText("0xf39F").click();
    await expect(page.getByText("Connected Account")).toBeVisible();
    await expect(page.getByText("StudioNet (Chain 61999)")).toBeVisible();
  });
});

test.describe("Wallet Connect Panel (no wallet installed)", () => {
  test.beforeEach(async ({ page }) => {
    // No mock injected -- window.ethereum remains undefined
    await page.goto("/");
  });

  test("shows hint when no wallet is installed", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await expect(page.getByText(/No wallet detected/i)).toBeVisible();
  });
});

test.describe("Submit form wallet integration", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMock(page);
    await page.goto("/");
  });

  test("Signing as chip appears after wallet is connected", async ({ page }) => {
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();

    // Not yet connected -- chip should not be visible
    await expect(page.getByText("Signing as")).not.toBeVisible();

    // Connect wallet via header
    await page.getByText("Connect Wallet").click();
    await completeConnect(page);

    // Navigate back to the Submit tab
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();

    await expect(page.getByText("Signing as")).toBeVisible();
  });
});
