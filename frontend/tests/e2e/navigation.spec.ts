// tests/e2e/navigation.spec.ts
// Verifies the app loads, the header renders, and tab navigation works.

import { test, expect } from "@playwright/test";

const CONTRACT_SHORT = "0x5f3b98...A63B4";

test.describe("App loads", () => {
  test("page title contains LexiTreasury", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LexiTreasury/i);
  });

  test("header brand mark is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("LexiTreasury").first()).toBeVisible();
  });

  test("hero headline is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Autonomous Treasury/i).first()
    ).toBeVisible();
  });

  test("hero subheading mentions AI Consensus", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/AI Consensus/i).first()
    ).toBeVisible();
  });

  test("contract address chip is displayed in hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Contract").first()).toBeVisible();
  });

  test("StudioNet badge is visible in header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("StudioNet").first()).toBeVisible();
  });

  test("Connect Wallet button is visible in header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Connect Wallet")).toBeVisible();
  });
});

test.describe("Tab navigation", () => {
  test("Constitution & Overview tab is active by default", async ({ page }) => {
    await page.goto("/");
    const tab = page.locator("#app-tabs").getByRole("button", { name: /Constitution & Overview/ });
    await expect(tab).toBeVisible();
    // Active tab has cyan text class applied
    await expect(tab).toHaveClass(/text-cyan-400/);
  });

  test("clicking Proposals & Audits tab switches content", async ({ page }) => {
    await page.goto("/");
    await page.locator("#app-tabs").getByRole("button", { name: /Proposals & Audits/ }).click();
    // After switching, Proposals tab content should be present
    await expect(page.getByText(/Proposals|No proposals/i).first()).toBeVisible();
  });

  test("clicking Submit Proposal tab shows the submission form", async ({ page }) => {
    await page.goto("/");
    await page.locator("#app-tabs").getByRole("button", { name: /Submit Proposal/ }).click();
    await expect(
      page.getByPlaceholder(/https:\/\/github\.com\/owner\/repo/i)
    ).toBeVisible();
  });

  test("switching between all three tabs does not crash the page", async ({ page }) => {
    await page.goto("/");
    const tabNav = page.locator("#app-tabs");
    const tabs = ["Constitution & Overview", "Proposals & Audits", "Submit Proposal"];
    for (const label of tabs) {
      await tabNav.getByRole("button", { name: new RegExp(label, "i") }).click();
      await expect(page.locator("body")).not.toHaveClass(/error/);
    }
  });
});

test.describe("Launch Dashboard CTA", () => {
  test("clicking Launch Dashboard scrolls to tab section", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: /Launch Dashboard/i });
    await expect(btn).toBeVisible();
    await btn.click();
    // After scroll the tab nav should be in view
    await expect(
      page.locator("#app-tabs").getByRole("button", { name: /Constitution & Overview/ })
    ).toBeInViewport();
  });
});
