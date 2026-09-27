import { test, expect } from "@playwright/test";
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
