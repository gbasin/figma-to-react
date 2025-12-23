#!/usr/bin/env bun
/**
 * capture-screenshot.ts
 *
 * Capture a screenshot of a rendered component using headless Playwright.
 * Screenshots the [data-figma-component] element at its natural size.
 *
 * Usage:
 *   bun capture-screenshot.ts <url> <output.png>
 *
 * Arguments:
 *   url      - URL to capture (e.g., http://localhost:5173/figma-preview?screen=Login)
 *   output   - Output path for screenshot (e.g., /tmp/rendered-Login.png)
 *
 * Example:
 *   bun capture-screenshot.ts "http://localhost:5173/figma-preview?screen=Login" /tmp/rendered.png
 */

import { chromium } from 'playwright';

const url = process.argv[2];
const output = process.argv[3];

if (!url || !output) {
  console.error('Usage: bun capture-screenshot.ts <url> <output.png>');
  console.error('');
  console.error('Arguments:');
  console.error('  url      - URL to capture');
  console.error('  output   - Output path for screenshot');
  console.error('');
  console.error('Screenshots the [data-figma-component] element at its natural size.');
  process.exit(1);
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2, // Retina-quality screenshots
  });
  const page = await context.newPage();

  try {
    // Use domcontentloaded instead of networkidle because Vite's HMR WebSocket
    // keeps a persistent connection open, preventing networkidle from ever firing
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Find the component element and wait for it to be visible
    const element = await page.locator('[data-figma-component]');
    await element.waitFor({ state: 'visible', timeout: 10000 });

    // Small delay for any animations to settle
    await page.waitForTimeout(500);
    const box = await element.boundingBox();
    await element.screenshot({ path: output });
    console.log(`Screenshot saved: ${output}`);
    console.log(`Component size: ${box?.width}x${box?.height} @2x`);
  } catch (error) {
    console.error(`Error capturing screenshot: ${error}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

capture();
