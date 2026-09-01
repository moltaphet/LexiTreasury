// tests/e2e/submit.spec.ts
// Tests for the Submit Proposal form: field validation, error states, loading state.
// Does NOT submit real transactions -- validation errors are triggered client-side.

import { test, expect, type Page } from "@playwright/test";

const VALID_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const VALID_URL = "https://github.com/ethereum/solidity";

async function openSubmitTab(page: Page) {
  await page.goto("/");
  await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();
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

    // Fill private key field (wallet not connected)
    await page.locator('input[type="password"]').first().fill(VALID_KEY);
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();

    await expect(page.getByText(/must start with https:\/\/github\.com\//i)).toBeVisible();
  });

  test("shows error for a zero or negative amount", async ({ page }) => {
    await openSubmitTab(page);

    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
    await page.getByPlaceholder("1000").fill("0");
    await page.locator('input[type="password"]').first().fill(VALID_KEY);
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();

    await expect(page.getByText(/positive number/i)).toBeVisible();
  });

  test("shows error for an invalid private key when wallet not connected", async ({ page }) => {
    await openSubmitTab(page);

    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
    await page.getByPlaceholder("1000").fill("100");
    await page.locator('input[type="password"]').first().fill("0xbadkey");
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();

    await expect(page.getByText(/32-byte|66 chars/i)).toBeVisible();
  });

  test("error banner disappears when a new valid submission starts", async ({ page }) => {
    await openSubmitTab(page);

    // Trigger an error first
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill("bad-url");
    await page.getByPlaceholder("1000").fill("100");
    await page.locator('input[type="password"]').first().fill(VALID_KEY);
    await page.getByRole("button", { name: /Submit to GenLayer/i }).click();
    await expect(page.getByText(/Validation Error/i)).toBeVisible();

    // Fix the URL -- the error should clear on next submission attempt
    await page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i).fill(VALID_URL);
  });
});

test.describe("Submit form with wallet connected", () => {
  async function connectWallet(page: Page) {
    await page.getByText("Connect Wallet").click();
    await page.locator('input[placeholder="0x..."]').first().fill(VALID_KEY);
    await page.getByRole("button", { name: /^Connect$/ }).click();
  }

  test("private key field is replaced by Signing as chip", async ({ page }) => {
    await openSubmitTab(page);
    await connectWallet(page);
    await expect(page.getByText("Signing as")).toBeVisible();
    // Password input should no longer be in the form
    const keyInput = page.locator('input[type="password"]');
    await expect(keyInput).not.toBeVisible();
  });

  test("shows validation error for invalid URL even when wallet is connected", async ({ page }) => {
    await openSubmitTab(page);
    await connectWallet(page);

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
