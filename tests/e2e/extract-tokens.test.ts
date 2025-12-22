import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/extract-tokens.sh');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/figma-frames');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-token-tests');

describe('extract-tokens.sh - Token Extraction', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  const runExtractor = async (input: string): Promise<string> => {
    const inputFile = path.join(TMP_DIR, 'input.txt');
    const outputFile = path.join(TMP_DIR, 'output.css');

    await fs.writeFile(inputFile, input);
    execSync(`bash "${SCRIPT_PATH}" "${inputFile}" "${outputFile}"`, { stdio: 'pipe' });

    return fs.readFile(outputFile, 'utf-8');
  };

  describe('Simple values', () => {
    it('should extract simple hex color', async () => {
      const result = await runExtractor('var(--color, #fff)');
      expect(result).toContain('--color: #fff;');
    });

    it('should extract pixel value', async () => {
      const result = await runExtractor('var(--size, 16px)');
      expect(result).toContain('--size: 16px;');
    });

    it('should extract value with escaped slashes', async () => {
      const result = await runExtractor('className="gap-[var(--space\\/1, 8px)]"');
      expect(result).toContain('--space\\/1: 8px;');
    });

    it('should extract color name', async () => {
      const result = await runExtractor('var(--color, red)');
      expect(result).toContain('--color: red;');
    });
  });

  describe('One level nesting (rgba, rgb)', () => {
    it('should extract rgba with commas', async () => {
      const result = await runExtractor('var(--bg, rgba(0,0,0,0.8))');
      expect(result).toContain('--bg: rgba(0,0,0,0.8);');
    });

    it('should extract rgb with spaces', async () => {
      const result = await runExtractor('var(--bg, rgb(255, 255, 255))');
      expect(result).toContain('--bg: rgb(255, 255, 255);');
    });

    it('should extract box shadow with rgba', async () => {
      const result = await runExtractor('var(--shadow, 0 0 10px rgba(0,0,0,0.5))');
      expect(result).toContain('--shadow: 0 0 10px rgba(0,0,0,0.5);');
    });
  });

  describe('Deep nesting (calc, min, max, clamp)', () => {
    it('should extract calc with nested parens', async () => {
      const result = await runExtractor('var(--width, calc((100% - 20px) / 2))');
      expect(result).toContain('--width: calc((100% - 20px) / 2);');
    });

    it('should extract clamp function', async () => {
      const result = await runExtractor('var(--size, clamp(1rem, 2vw + 1rem, 3rem))');
      expect(result).toContain('--size: clamp(1rem, 2vw + 1rem, 3rem);');
    });

    it('should extract nested min/max', async () => {
      const result = await runExtractor('var(--size, min(100px, max(50px, 10vw)))');
      expect(result).toContain('--size: min(100px, max(50px, 10vw));');
    });

    it('should extract deeply nested calc', async () => {
      const result = await runExtractor('var(--complex, calc(100% - max(20px, min(50px, 5vw))))');
      expect(result).toContain('--complex: calc(100% - max(20px, min(50px, 5vw)));');
    });
  });

  describe('Multiple commas in functions', () => {
    it('should extract linear-gradient with multiple stops', async () => {
      const result = await runExtractor('var(--gradient, linear-gradient(45deg, red, blue))');
      expect(result).toContain('--gradient: linear-gradient(45deg, red, blue);');
    });

    it('should extract gradient with nested rgba', async () => {
      const result = await runExtractor(
        'var(--gradient, linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,1)))'
      );
      expect(result).toContain(
        '--gradient: linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,1));'
      );
    });

    it('should extract conic-gradient with many color stops', async () => {
      const result = await runExtractor(
        'var(--conic, conic-gradient(from 0deg at 50% 50%, red, green, blue, red))'
      );
      expect(result).toContain(
        '--conic: conic-gradient(from 0deg at 50% 50%, red, green, blue, red);'
      );
    });
  });

  describe('Multiple var() on same line', () => {
    it('should extract multiple simple vars', async () => {
      const result = await runExtractor('class="gap-[var(--a, 1px)] p-[var(--b, 2px)]"');
      expect(result).toContain('--a: 1px;');
      expect(result).toContain('--b: 2px;');
    });

    it('should extract multiple complex vars', async () => {
      const result = await runExtractor(
        'style="width: var(--w, calc(100% - 20px)); color: var(--c, rgba(0,0,0,0.5));"'
      );
      expect(result).toContain('--w: calc(100% - 20px);');
      expect(result).toContain('--c: rgba(0,0,0,0.5);');
    });
  });

  describe('Edge cases', () => {
    it('should handle nested var() calls', async () => {
      const result = await runExtractor('var(--outer, var(--inner, fallback))');
      expect(result).toContain('--outer: var(--inner, fallback);');
    });

    it('should handle url() function', async () => {
      const result = await runExtractor('var(--bg-image, url("image.png"))');
      expect(result).toContain('--bg-image: url("image.png");');
    });

    it('should deduplicate by name, preferring non-zero values', async () => {
      const result = await runExtractor(
        'var(--space, 0px) var(--space, 8px) var(--space, 0px)'
      );
      // Should keep 8px (non-zero value)
      expect(result).toContain('--space: 8px;');
      // Should not have 0px
      expect(result).not.toMatch(/--space: 0px;/);
    });
  });

  describe('Real-world fixtures', () => {
    it('should extract tokens from Frame 237-2571 fixture', async () => {
      const fixtureInput = path.join(FIXTURES_DIR, '237-2571/design-context.txt');
      const outputFile = path.join(TMP_DIR, 'fixture-output.css');

      execSync(`bash "${SCRIPT_PATH}" "${fixtureInput}" "${outputFile}"`, { stdio: 'pipe' });

      const result = await fs.readFile(outputFile, 'utf-8');

      // Verify structure
      expect(result).toContain(':root {');
      expect(result).toContain('}');

      // Verify known tokens from this fixture
      expect(result).toContain('--background\\/overlay');
      expect(result).toContain('--background\\/surface-alt');
      expect(result).toContain('--border-radius\\/full');
      expect(result).toContain('--border-radius\\/large');
      expect(result).toContain('--space\\/1');
      expect(result).toContain('--space\\/2');
      expect(result).toContain('--content\\/always-light');
    });

    it('should extract tokens from Frame 238-1790 fixture', async () => {
      const fixtureInput = path.join(FIXTURES_DIR, '238-1790/design-context.txt');
      const outputFile = path.join(TMP_DIR, 'fixture-output.css');

      execSync(`bash "${SCRIPT_PATH}" "${fixtureInput}" "${outputFile}"`, { stdio: 'pipe' });

      const result = await fs.readFile(outputFile, 'utf-8');

      expect(result).toContain(':root {');
      expect(result).toContain('--');
    });
  });
});
