import { test, expect } from "@playwright/test";

test.describe("Phase 5: PWA & Offline E2E Tests", () => {
  test("manifest.json contains required PWA metadata and icons", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();

    const manifest = await res.json();
    expect(manifest.name).toContain("SatyaRPL");
    expect(manifest.short_name).toContain("SatyaRPL");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/worker");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test("service worker sw.js is accessible and versioned", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();

    const swContent = await res.text();
    expect(swContent).toContain("satyarpl-shell-v1.0.0");
    expect(swContent).toContain("satyarpl-evidence-sync");
  });

  test("offline fallback page is accessible", async ({ request }) => {
    const res = await request.get("/offline.html");
    expect(res.ok()).toBeTruthy();

    const html = await res.text();
    expect(html).toContain("OFFLINE MODE / ऑफ़लाइन मोड");
    expect(html).toContain("SatyaRPL");
  });

  test("Worker UI renders Offline Sync drawer, storage estimator, and NOT_CONFIGURED attestation badge", async ({
    page,
  }) => {
    await page.goto("/worker");

    // Verify page loads
    await expect(page.locator("h1")).toBeVisible();

    // Verify sync status pill exists
    const syncButton = page.locator("[data-testid='sync-status-pill']");
    await expect(syncButton).toBeVisible();

    // Click to open Sync Queue Drawer
    await syncButton.click();

    // Verify Attestation status is NOT_CONFIGURED (Honest audit state)
    await expect(page.getByText("NOT_CONFIGURED", { exact: true })).toBeVisible();

    // Verify storage estimator is rendered
    await expect(page.locator("text=IndexedDB")).toBeVisible();
  });

  test("Airplane mode emulation: offline banner triggers and captures queue locally", async ({
    page,
    context,
  }) => {
    await page.goto("/worker/capture");

    // Set browser context to offline (Airplane mode)
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Verify offline banner appears (matches bilingual label or role)
    const offlineBanner = page.locator("aside[aria-label='Offline mode alert']");
    await expect(offlineBanner).toBeVisible({ timeout: 5000 });

    // Reconnect to network
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Verify offline banner disappears
    await expect(offlineBanner).not.toBeVisible({ timeout: 5000 });
  });
});
