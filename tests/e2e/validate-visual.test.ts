import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/validate-visual.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-validate-visual-tests');

// Helper to create a solid color test image with ImageMagick
const createTestImage = (filepath: string, width: number, height: number, color: string = 'blue') => {
  execSync(`magick -size ${width}x${height} xc:${color} "${filepath}"`, { stdio: 'pipe' });
};

// Helper to run the validation script and capture output (using spawnSync for proper stderr capture)
const runValidation = (
  figmaImg: string,
  renderedImg: string,
  component?: string,
  pass?: number
): { stdout: string; stderr: string; exitCode: number } => {
  const args = [SCRIPT_PATH, figmaImg, renderedImg];
  if (component) args.push(component);
  if (pass !== undefined) args.push(String(pass));

  const result = spawnSync('bash', args, { encoding: 'utf-8' });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  };
};

describe('validate-visual.sh - Visual Validation', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
    // Clean up any previous validation output
    await fs.remove('/tmp/figma-to-react/validation');
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
    await fs.remove('/tmp/figma-to-react/validation');
  });

  describe('Dimension Handling', () => {
    it('should report matching dimensions when images are same size', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-match.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-match.png');

      createTestImage(figmaImg, 100, 100, 'blue');
      createTestImage(renderedImg, 100, 100, 'blue');

      const result = runValidation(figmaImg, renderedImg, 'match-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Dimensions match: 100x100');
    });

    it('should detect 2x retina scaling', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-1x.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-2x.png');

      createTestImage(figmaImg, 100, 100, 'red');
      createTestImage(renderedImg, 200, 200, 'red');

      const result = runValidation(figmaImg, renderedImg, 'retina-2x-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Detected 2x retina scaling');
      expect(result.stderr).toContain('Figma:    100x100 (1x)');
      expect(result.stderr).toContain('Rendered: 200x200 (2x)');
      expect(result.stderr).toContain('Upscaling Figma 2x for comparison');
    });

    it('should detect 3x retina scaling', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-1x.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-3x.png');

      createTestImage(figmaImg, 100, 150, 'green');
      createTestImage(renderedImg, 300, 450, 'green');

      const result = runValidation(figmaImg, renderedImg, 'retina-3x-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Detected 3x retina scaling');
      expect(result.stderr).toContain('Figma:    100x150 (1x)');
      expect(result.stderr).toContain('Rendered: 300x450 (3x)');
      expect(result.stderr).toContain('Upscaling Figma 3x for comparison');
    });

    it('should warn on non-multiple dimension mismatch', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-mismatch.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-mismatch.png');

      createTestImage(figmaImg, 100, 100, 'yellow');
      createTestImage(renderedImg, 150, 150, 'yellow'); // 1.5x - not a clean multiple

      const result = runValidation(figmaImg, renderedImg, 'mismatch-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('WARNING: Dimension mismatch');
      expect(result.stderr).toContain('Expected: 100x100 (Figma)');
      expect(result.stderr).toContain('Got:      150x150 (rendered)');
      expect(result.stderr).toContain('Resizing Figma to match for comparison');
    });

    it('should handle asymmetric retina scaling as mismatch', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-asym.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-asym.png');

      createTestImage(figmaImg, 100, 100, 'purple');
      createTestImage(renderedImg, 200, 300, 'purple'); // 2x width, 3x height - invalid

      const result = runValidation(figmaImg, renderedImg, 'asymmetric-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('WARNING: Dimension mismatch');
    });

    it('should handle non-exact multiple as mismatch', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-nonexact.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-nonexact.png');

      createTestImage(figmaImg, 100, 100, 'cyan');
      createTestImage(renderedImg, 201, 201, 'cyan'); // Almost 2x but not exact

      const result = runValidation(figmaImg, renderedImg, 'nonexact-test', 1);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('WARNING: Dimension mismatch');
    });
  });

  describe('Same-file Copy Prevention', () => {
    it('should not fail when rendered image is already in output directory', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-samefile.png');
      createTestImage(figmaImg, 100, 100, 'orange');

      // Create the output directory structure first
      const validationDir = '/tmp/figma-to-react/validation/samefile-test/pass-1';
      await fs.ensureDir(validationDir);

      // Create rendered image directly in the output location
      const renderedImg = path.join(validationDir, 'rendered.png');
      createTestImage(renderedImg, 100, 100, 'orange');

      // This should NOT fail due to "cp: source and destination are same"
      const result = runValidation(figmaImg, renderedImg, 'samefile-test', 1);

      expect(result.exitCode).toBe(0);
      // Should still complete successfully
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+$/); // Should output diff percentage
    });
  });

  describe('Output Structure', () => {
    it('should create correct output directory structure', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-output.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-output.png');

      createTestImage(figmaImg, 100, 100, 'blue');
      createTestImage(renderedImg, 100, 100, 'blue');

      runValidation(figmaImg, renderedImg, 'output-test', 1);

      const validationDir = '/tmp/figma-to-react/validation/output-test';

      // Check directory structure
      expect(await fs.pathExists(validationDir)).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'figma.png'))).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'pass-1', 'rendered.png'))).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'pass-1', 'diff.png'))).toBe(true);
    });

    it('should preserve figma.png across multiple passes', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-multipass.png');
      const renderedImg1 = path.join(TMP_DIR, 'rendered-pass1.png');
      const renderedImg2 = path.join(TMP_DIR, 'rendered-pass2.png');

      createTestImage(figmaImg, 100, 100, 'blue');
      createTestImage(renderedImg1, 100, 100, 'blue');
      createTestImage(renderedImg2, 100, 100, 'lightblue');

      // Run pass 1
      runValidation(figmaImg, renderedImg1, 'multipass-test', 1);

      // Run pass 2
      runValidation(figmaImg, renderedImg2, 'multipass-test', 2);

      const validationDir = '/tmp/figma-to-react/validation/multipass-test';

      // Check both passes exist
      expect(await fs.pathExists(path.join(validationDir, 'pass-1', 'rendered.png'))).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'pass-1', 'diff.png'))).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'pass-2', 'rendered.png'))).toBe(true);
      expect(await fs.pathExists(path.join(validationDir, 'pass-2', 'diff.png'))).toBe(true);

      // Figma reference should exist only once at component level
      expect(await fs.pathExists(path.join(validationDir, 'figma.png'))).toBe(true);
    });
  });

  describe('Diff Calculation', () => {
    it('should return 0% diff for identical images', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-identical.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-identical.png');

      createTestImage(figmaImg, 100, 100, 'blue');
      createTestImage(renderedImg, 100, 100, 'blue');

      const result = runValidation(figmaImg, renderedImg, 'identical-test', 1);

      expect(result.exitCode).toBe(0);
      const diffPercent = parseFloat(result.stdout.trim());
      expect(diffPercent).toBe(0);
    });

    it('should return non-zero diff for different images', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-different.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-different.png');

      createTestImage(figmaImg, 100, 100, 'blue');
      createTestImage(renderedImg, 100, 100, 'red');

      const result = runValidation(figmaImg, renderedImg, 'different-test', 1);

      expect(result.exitCode).toBe(0);
      const diffPercent = parseFloat(result.stdout.trim());
      expect(diffPercent).toBeGreaterThan(0);
    });

    it('should return valid diff for 2x retina images', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-retina-diff.png');
      const renderedImg = path.join(TMP_DIR, 'rendered-retina-diff.png');

      createTestImage(figmaImg, 100, 100, 'green');
      createTestImage(renderedImg, 200, 200, 'green');

      const result = runValidation(figmaImg, renderedImg, 'retina-diff-test', 1);

      expect(result.exitCode).toBe(0);
      const diffPercent = parseFloat(result.stdout.trim());
      // Should be close to 0 since same color, just scaled
      expect(diffPercent).toBeLessThan(5);
    });
  });

  describe('Error Handling', () => {
    it('should fail when figma image does not exist', async () => {
      const renderedImg = path.join(TMP_DIR, 'rendered-exists.png');
      createTestImage(renderedImg, 100, 100, 'blue');

      const result = runValidation('/nonexistent/figma.png', renderedImg, 'error-test', 1);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error: Figma screenshot not found');
    });

    it('should fail when rendered image does not exist', async () => {
      const figmaImg = path.join(TMP_DIR, 'figma-exists.png');
      createTestImage(figmaImg, 100, 100, 'blue');

      const result = runValidation(figmaImg, '/nonexistent/rendered.png', 'error-test', 1);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error: Rendered screenshot not found');
    });

    it('should show usage when no arguments provided', async () => {
      const result = runValidation('', '', '', undefined);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Usage:');
    });
  });
});
