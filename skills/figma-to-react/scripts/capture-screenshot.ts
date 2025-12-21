#!/usr/bin/env npx tsx
/**
 * capture-screenshot.ts
 *
 * Capture a screenshot of a rendered component using headless Playwright.
 *
 * Usage:
 *   npx tsx capture-screenshot.ts <url> <output.png> [width] [height]
 *
 * Arguments:
 *   url      - URL to capture (e.g., http://localhost:5173/figma-preview?screen=Login)
 *   output   - Output path for screenshot (e.g., /tmp/rendered-Login.png)
 *   width    - Viewport width (default: 1280)
 *   height   - Viewport height (default: 800)
 *
 * Example:
 *   npx tsx capture-screenshot.ts "http://localhost:5173/figma-preview?screen=Login" /tmp/rendered.png
 *   npx tsx capture-screenshot.ts "http://localhost:5173/figma-preview?screen=Mobile" /tmp/mobile.png 390 844
 */

import { chromium } from 'playwright';

const url = process.argv[2];
const output = process.argv[3];
const width = parseInt(process.argv[4] || '1280', 10);
const height = parseInt(process.argv[5] || '800', 10);

if (!url || !output) {
  console.error('Usage: npx tsx capture-screenshot.ts <url> <output.png> [width] [height]');
  console.error('');
  console.error('Arguments:');
  console.error('  url      - URL to capture');
  console.error('  output   - Output path for screenshot');
  console.error('  width    - Viewport width (default: 1280)');
  console.error('  height   - Viewport height (default: 800)');
  process.exit(1);
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2, // Retina-quality screenshots
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Small delay for any animations to settle
    await page.waitForTimeout(500);

    await page.screenshot({ path: output, fullPage: true });
    console.log(`Screenshot saved: ${output}`);
    console.log(`Viewport: ${width}x${height} @2x`);
  } catch (error) {
    console.error(`Error capturing screenshot: ${error}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

capture();
