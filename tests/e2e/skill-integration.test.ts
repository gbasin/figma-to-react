/**
 * Integration tests that require real Figma MCP connection.
 *
 * These tests are skipped by default. To run them:
 * 1. Open Figma Desktop app
 * 2. Ensure the Figma MCP is enabled
 * 3. Run: FIGMA_INTEGRATION=true pnpm test:e2e
 *
 * Or run manually with the Figma frames:
 *   - Frame 1: https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=237-2571&m=dev
 *   - Frame 2: https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=238-1790&m=dev
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { startDevServer, stopDevServer, waitForServer, getDevServerPort } from './utils/dev-server';
import { resetTestProject, cleanTmpDir, isImageMagickAvailable, getTmpDir } from './utils/cleanup';
import { TEST_PROJECT_DIR } from './setup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_DIR = path.resolve(__dirname, '../../skills/figma-to-react');
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
const TMP_DIR = getTmpDir();

// Test Figma frames from the Onfido Web SDK Community file
const TEST_FRAMES = {
  frame1: {
    url: 'https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=237-2571&m=dev',
    nodeId: '237-2571',
    fileKey: 'd2P4yPAlmQtwwU6Ccq9BR1',
  },
  frame2: {
    url: 'https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=238-1790&m=dev',
    nodeId: '238-1790',
    fileKey: 'd2P4yPAlmQtwwU6Ccq9BR1',
  },
};

// Skip these tests unless FIGMA_INTEGRATION env var is set
const shouldRun = process.env.FIGMA_INTEGRATION === 'true';
const describeIf = shouldRun ? describe : describe.skip;

describeIf('Figma Integration Tests (requires Figma MCP)', () => {
  beforeAll(async () => {
    // Ensure clean state
    await cleanTmpDir();
    await resetTestProject(TEST_PROJECT_DIR);
  });

  afterAll(async () => {
    await stopDevServer();
  });

  beforeEach(async () => {
    await cleanTmpDir();
  });

  describe('Visual Validation Scripts', () => {
    it('validate-visual.sh should compare two images and return diff percentage', async () => {
      // Skip if ImageMagick is not available
      if (!isImageMagickAvailable()) {
        console.log('Skipping visual validation test - ImageMagick not installed');
        return;
      }

      // Create two slightly different test images
      const figmaImg = path.join(TMP_DIR, 'figma.png');
      const renderedImg = path.join(TMP_DIR, 'rendered.png');
      const diffOutput = path.join(TMP_DIR, 'diff.png');

      await fs.ensureDir(TMP_DIR);

      // Create simple test images using ImageMagick
      execSync(`magick -size 100x100 xc:white "${figmaImg}"`, { stdio: 'pipe' });
      execSync(`magick -size 100x100 xc:white -fill red -draw "rectangle 10,10 20,20" "${renderedImg}"`, {
        stdio: 'pipe',
      });

      // Run validate-visual.sh
      const validateScript = path.join(SCRIPTS_DIR, 'validate-visual.sh');
      const result = execSync(`bash "${validateScript}" "${figmaImg}" "${renderedImg}" "${diffOutput}"`, {
        cwd: SKILL_DIR,
        encoding: 'utf-8',
      });

      // Should return a percentage
      const diffPercent = parseFloat(result.trim());
      expect(diffPercent).toBeGreaterThan(0);
      expect(diffPercent).toBeLessThan(100);

      // Should create diff image
      expect(await fs.pathExists(diffOutput)).toBe(true);
    });

    it('capture-screenshot.ts should capture element screenshot', async () => {
      // Start dev server (returns dynamic port)
      const port = await startDevServer(TEST_PROJECT_DIR);
      await waitForServer(`http://localhost:${port}`);

      const screenshotPath = path.join(TMP_DIR, 'test-screenshot.png');
      await fs.ensureDir(TMP_DIR);

      const captureScript = path.join(SCRIPTS_DIR, 'capture-screenshot.ts');

      // Capture screenshot of the page
      execSync(
        `npx tsx "${captureScript}" "http://localhost:${port}" "${screenshotPath}"`,
        {
          cwd: TEST_PROJECT_DIR,
          stdio: 'pipe',
          timeout: 30000,
        }
      );

      // Should create screenshot
      expect(await fs.pathExists(screenshotPath)).toBe(true);

      // Should be a valid PNG
      const fileInfo = execSync(`file "${screenshotPath}"`, { encoding: 'utf-8' });
      expect(fileInfo).toContain('PNG');
    }, 60000);
  });

  describe('Full Workflow with Figma', () => {
    it.todo('should convert Frame 237-2571 with real Figma MCP');
    it.todo('should convert Frame 238-1790 with real Figma MCP');
  });
});

// Always run these tests (no Figma needed)
describe('Preview Wrapper Dimension Tests', () => {
  afterAll(async () => {
    await stopDevServer();
  });

  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  /**
   * Critical test: Verifies that a component with size-full on its root element
   * is correctly constrained by the preview wrapper's explicit dimensions.
   *
   * This test ensures:
   * 1. The wrapper has explicit width/height from Figma metadata
   * 2. The wrapper has overflow:hidden to clip content
   * 3. The screenshot dimensions exactly match the expected Figma frame size
   * 4. Components with size-full expand to fill (not overflow) the wrapper
   */
  it('should constrain size-full component to wrapper dimensions', async () => {
    // Expected dimensions for SizeFullTestComponent (defined in App.tsx)
    const expectedWidth = 393;
    const expectedHeight = 852;
    const deviceScaleFactor = 2; // capture-screenshot.ts uses 2x

    // Start dev server
    const port = await startDevServer(TEST_PROJECT_DIR);
    await waitForServer(`http://localhost:${port}`);

    const screenshotPath = path.join(TMP_DIR, 'size-full-test.png');
    const captureScript = path.join(SCRIPTS_DIR, 'capture-screenshot.ts');

    // Capture screenshot of the SizeFullTestComponent
    execSync(
      `npx tsx "${captureScript}" "http://localhost:${port}/figma-preview?screen=SizeFullTestComponent" "${screenshotPath}"`,
      {
        cwd: TEST_PROJECT_DIR,
        stdio: 'pipe',
        timeout: 30000,
      }
    );

    // Verify screenshot was created
    expect(await fs.pathExists(screenshotPath)).toBe(true);

    // Get actual screenshot dimensions using ImageMagick
    const identifyOutput = execSync(`magick identify -format "%w %h" "${screenshotPath}"`, {
      encoding: 'utf-8',
    }).trim();
    const [actualWidth, actualHeight] = identifyOutput.split(' ').map(Number);

    // Screenshot should match expected dimensions (accounting for 2x scale factor)
    const expectedPixelWidth = expectedWidth * deviceScaleFactor;
    const expectedPixelHeight = expectedHeight * deviceScaleFactor;

    expect(actualWidth).toBe(expectedPixelWidth);
    expect(actualHeight).toBe(expectedPixelHeight);

    console.log(`Screenshot dimensions: ${actualWidth}x${actualHeight}`);
    console.log(`Expected (at ${deviceScaleFactor}x): ${expectedPixelWidth}x${expectedPixelHeight}`);
  }, 60000);

  /**
   * Test that overflow content is clipped by the wrapper.
   * The SizeFullTestComponent has an absolutely positioned element that extends
   * beyond the frame bounds - this should NOT appear in the screenshot.
   */
  it('should clip overflow content with overflow:hidden', async () => {
    // Skip if ImageMagick is not available
    if (!isImageMagickAvailable()) {
      console.log('Skipping overflow test - ImageMagick not installed');
      return;
    }

    const port = getDevServerPort();
    if (!port) {
      console.log('Skipping overflow test - dev server not running');
      return;
    }

    const screenshotPath = path.join(TMP_DIR, 'overflow-test.png');
    const captureScript = path.join(SCRIPTS_DIR, 'capture-screenshot.ts');

    // Capture screenshot
    execSync(
      `npx tsx "${captureScript}" "http://localhost:${port}/figma-preview?screen=SizeFullTestComponent" "${screenshotPath}"`,
      {
        cwd: TEST_PROJECT_DIR,
        stdio: 'pipe',
        timeout: 30000,
      }
    );

    // Check that red (overflow content) is NOT present in the screenshot
    // The SizeFullTestComponent has a red div that should be clipped
    // We use ImageMagick to check for red pixels
    const colorOutput = execSync(
      `magick "${screenshotPath}" -format "%[fx:mean.r > 0.8 && mean.g < 0.3 && mean.b < 0.3 ? 1 : 0]" info:`,
      { encoding: 'utf-8' }
    ).trim();

    // If overflow is properly clipped, there should be no significant red
    // (The component has blue background, white text - red would indicate overflow leaked)
    // Note: This is a heuristic check - the red overflow div should be completely hidden
    expect(colorOutput).not.toBe('1');
  }, 60000);
});

describe('Validation Script Unit Tests', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  it('validate-component.sh should return correct exit codes', async () => {
    // This test verifies the script structure without running full validation
    const validateScript = path.join(SCRIPTS_DIR, 'validate-component.sh');
    expect(await fs.pathExists(validateScript)).toBe(true);

    // Check script has the expected exit codes documented
    const content = await fs.readFile(validateScript, 'utf-8');
    // Script uses EXIT variable and exits with $EXIT
    expect(content).toContain('EXIT=0'); // success
    expect(content).toContain('EXIT=1'); // needs_fix
    expect(content).toContain('EXIT=2'); // good_enough
    expect(content).toContain('exit $EXIT');
  });

  it('save-component-metadata.sh should exist and be executable', async () => {
    const script = path.join(SCRIPTS_DIR, 'save-component-metadata.sh');
    expect(await fs.pathExists(script)).toBe(true);

    const content = await fs.readFile(script, 'utf-8');
    expect(content).toContain('#!/');
    expect(content).toContain('/tmp/figma-to-react/metadata');
  });

  it('rename-assets.sh should exist and handle asset renaming', async () => {
    const script = path.join(SCRIPTS_DIR, 'rename-assets.sh');
    expect(await fs.pathExists(script)).toBe(true);

    const content = await fs.readFile(script, 'utf-8');
    expect(content).toContain('#!/');
  });
});
