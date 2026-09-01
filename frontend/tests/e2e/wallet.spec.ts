// tests/e2e/wallet.spec.ts
// Tests the Connect Wallet panel in the header: open, validate, connect, disconnect.

import { test, expect } from "@playwright/test";

// A syntactically valid 32-byte hex key (Hardhat dev account #0 -- safe for testnet demos).
const VALID_TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXPECTED_ADDRESS_SHORT = "0xf39F"; // first 6 chars of the derived address

test.describe("Wallet Connect Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Connect Wallet button opens the panel", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await expect(page.getByText("Connect StudioNet Account")).toBeVisible();
  });

  test("panel closes when Cancel is clicked", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Connect StudioNet Account")).not.toBeVisible();
  });

  test("panel shows an error for a key that is too short", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    const input = page.locator('input[placeholder="0x..."]').first();
    await input.fill("0xdeadbeef");
    await page.getByRole("button", { name: /^Connect$/ }).click();
    await expect(page.getByText(/32-byte|66 chars/i)).toBeVisible();
  });

  test("panel shows an error for a non-hex string", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    const input = page.locator('input[placeholder="0x..."]').first();
    await input.fill("this-is-not-a-key");
    await page.getByRole("button", { name: /^Connect$/ }).click();
    await expect(page.getByText(/32-byte|66 chars/i)).toBeVisible();
  });

  test("connecting with a valid key shows the address in the header", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    const input = page.locator('input[placeholder="0x..."]').first();
    await input.fill(VALID_TEST_KEY);
    await page.getByRole("button", { name: /^Connect$/ }).click();
    // Panel should close and the header should now show the derived address
    await expect(page.getByText("Connect Wallet")).not.toBeVisible();
    await expect(page.getByText(new RegExp(EXPECTED_ADDRESS_SHORT, "i"))).toBeVisible();
  });

  test("disconnecting returns the header to the Connect Wallet state", async ({ page }) => {
    // Connect first
    await page.getByText("Connect Wallet").click();
    await page.locator('input[placeholder="0x..."]').first().fill(VALID_TEST_KEY);
    await page.getByRole("button", { name: /^Connect$/ }).click();
    await expect(page.getByText(new RegExp(EXPECTED_ADDRESS_SHORT, "i"))).toBeVisible();

    // Open the connected account panel and disconnect
    await page.getByText(new RegExp(EXPECTED_ADDRESS_SHORT, "i")).click();
    await page.getByRole("button", { name: "Disconnect" }).click();

    // Header should revert to showing Connect Wallet
    await expect(page.getByText("Connect Wallet")).toBeVisible();
  });

  test("connected wallet shows the full address in the dropdown", async ({ page }) => {
    await page.getByText("Connect Wallet").click();
    await page.locator('input[placeholder="0x..."]').first().fill(VALID_TEST_KEY);
    await page.getByRole("button", { name: /^Connect$/ }).click();
    // Open the account panel to see the full address
    await page.getByText(new RegExp(EXPECTED_ADDRESS_SHORT, "i")).click();
    await expect(page.getByText("Connected Account")).toBeVisible();
    await expect(page.getByText("StudioNet (Chain 61999)")).toBeVisible();
  });
});

test.describe("Submit form wallet integration", () => {
  test("private key field is hidden when wallet is connected", async ({ page }) => {
    await page.goto("/");

    // Navigate to Submit tab
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();

    // Before connecting: private key input should be visible
    await expect(page.getByPlaceholder(/0x\.\.\./i)).toBeVisible();

    // Connect wallet via header
    await page.getByText("Connect Wallet").click();
    await page.locator('input[placeholder="0x..."]').first().fill(VALID_TEST_KEY);
    await page.getByRole("button", { name: /^Connect$/ }).click();

    // After connecting: the "Signing as" chip should appear, key input should be hidden
    await expect(page.getByText("Signing as")).toBeVisible();
    await expect(page.locator('input[placeholder*="0x..."]')).not.toBeVisible();
  });
});
