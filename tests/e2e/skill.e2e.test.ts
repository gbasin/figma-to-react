import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { parseNodeIdFromUrl } from './utils/skill-runner';
import { startDevServer, stopDevServer, getDevServerPort } from './utils/dev-server';
import { TEST_PROJECT_DIR } from './setup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_DIR = path.resolve(__dirname, '../../skills/figma-to-react');
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react');

// Test Figma frames from the Onfido Web SDK Community file
const TEST_FRAMES = {
  frame1: {
    url: 'https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=237-2571&m=dev',
    nodeId: '237-2571',
    name: 'Motion / Mobile 3',
    fixtureDir: '237-2571',
  },
  frame2: {
    url: 'https://www.figma.com/design/d2P4yPAlmQtwwU6Ccq9BR1/Onfido-Web-SDK--Community-?node-id=238-1790&m=dev',
    nodeId: '238-1790',
    name: 'Motion / Mobile 4',
    fixtureDir: '238-1790',
  },
};

describe('figma-to-react Skill E2E', () => {
  describe('URL Parsing', () => {
    it('should correctly parse node-id from Figma URL', () => {
      const nodeId = parseNodeIdFromUrl(TEST_FRAMES.frame1.url);
      expect(nodeId).toBe('237-2571');
    });

    it('should correctly parse node-id from second Figma URL', () => {
      const nodeId = parseNodeIdFromUrl(TEST_FRAMES.frame2.url);
      expect(nodeId).toBe('238-1790');
    });
  });

  describe('Skill Scripts with Real Figma Fixtures', () => {
    beforeEach(async () => {
      await fs.ensureDir(TMP_DIR);
    });

    afterEach(async () => {
      await fs.remove(TMP_DIR);
    });

    it('extract-tokens.sh should extract CSS variables from Frame 237-2571', async () => {
      const sampleInput = path.join(FIXTURES_DIR, 'figma-frames/237-2571/design-context.txt');
      const outputTokens = path.join(TMP_DIR, 'test-tokens.css');
      const extractScript = path.join(SCRIPTS_DIR, 'extract-tokens.sh');

      // Run extract-tokens.sh
      execSync(`bash "${extractScript}" "${sampleInput}" "${outputTokens}"`, {
        cwd: SKILL_DIR,
        stdio: 'pipe',
      });

      // Verify output
      expect(await fs.pathExists(outputTokens)).toBe(true);

      const content = await fs.readFile(outputTokens, 'utf-8');

      // Should contain :root block
      expect(content).toContain(':root');

      // Should extract CSS variables from the Onfido design
      expect(content).toContain('--background');
      expect(content).toContain('--space');
    });

    it('extract-tokens.sh should extract CSS variables from Frame 238-1790', async () => {
      const sampleInput = path.join(FIXTURES_DIR, 'figma-frames/238-1790/design-context.txt');
      const outputTokens = path.join(TMP_DIR, 'test-tokens.css');
      const extractScript = path.join(SCRIPTS_DIR, 'extract-tokens.sh');

      execSync(`bash "${extractScript}" "${sampleInput}" "${outputTokens}"`, {
        cwd: SKILL_DIR,
        stdio: 'pipe',
      });

      expect(await fs.pathExists(outputTokens)).toBe(true);

      const content = await fs.readFile(outputTokens, 'utf-8');
      expect(content).toContain(':root');
      expect(content).toContain('--');
    });

    it('process-figma.sh should process Frame 237-2571 and create component', async () => {
      const sampleInput = path.join(FIXTURES_DIR, 'figma-frames/237-2571/design-context.txt');
      const outputComponent = path.join(TMP_DIR, 'MotionMobile3.tsx');
      const assetDir = path.join(TMP_DIR, 'assets');
      const tokensFile = path.join(TMP_DIR, 'tokens.css');
      const processScript = path.join(SCRIPTS_DIR, 'process-figma.sh');

      // Run process-figma.sh (assets may fail to download from localhost, but component should be created)
      try {
        execSync(
          `bash "${processScript}" "${sampleInput}" "${outputComponent}" "${assetDir}" "/assets" "${tokensFile}"`,
          {
            cwd: SKILL_DIR,
            stdio: 'pipe',
            timeout: 30000,
          }
        );
      } catch (error) {
        // Asset download may fail (localhost URLs), but component should still be created
        // Log for debugging but don't fail - check component exists below
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes('curl') && !errorMsg.includes('download')) {
          console.warn('process-figma.sh warning:', errorMsg);
        }
      }

      // Verify component was created
      expect(await fs.pathExists(outputComponent)).toBe(true);

      const content = await fs.readFile(outputComponent, 'utf-8');

      // Should contain the MotionMobile component
      expect(content).toContain('MotionMobile');
      expect(content).toContain('export');

      // Should have Tailwind classes
      expect(content).toContain('className');

      // Should have the correct text content
      expect(content).toContain('Turn your head slowly to both sides');
    });

    it('process-figma.sh should process Frame 238-1790 and create component', async () => {
      const sampleInput = path.join(FIXTURES_DIR, 'figma-frames/238-1790/design-context.txt');
      const outputComponent = path.join(TMP_DIR, 'MotionMobile4.tsx');
      const assetDir = path.join(TMP_DIR, 'assets');
      const tokensFile = path.join(TMP_DIR, 'tokens.css');
      const processScript = path.join(SCRIPTS_DIR, 'process-figma.sh');

      try {
        execSync(
          `bash "${processScript}" "${sampleInput}" "${outputComponent}" "${assetDir}" "/assets" "${tokensFile}"`,
          {
            cwd: SKILL_DIR,
            stdio: 'pipe',
            timeout: 30000,
          }
        );
      } catch (error) {
        // Asset download may fail - log but continue
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes('curl') && !errorMsg.includes('download')) {
          console.warn('process-figma.sh warning:', errorMsg);
        }
      }

      expect(await fs.pathExists(outputComponent)).toBe(true);

      const content = await fs.readFile(outputComponent, 'utf-8');
      expect(content).toContain('MotionMobile');
      expect(content).toContain('export');
      expect(content).toContain('Turn your head slowly to both sides');
    });

    it('should have all required skill scripts', async () => {
      const requiredScripts = [
        'process-figma.sh',
        'extract-tokens.sh',
        'validate-component.sh',
        'validate-visual.sh',
        'capture-screenshot.ts',
        'save-component-metadata.sh',
        'rename-assets.sh',
      ];

      for (const script of requiredScripts) {
        const scriptPath = path.join(SCRIPTS_DIR, script);
        expect(await fs.pathExists(scriptPath)).toBe(true);
      }
    });
  });

  describe('Figma Fixture Verification', () => {
    it('should have fixture files for Frame 237-2571', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'figma-frames/237-2571');

      expect(await fs.pathExists(path.join(fixtureDir, 'design-context.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(fixtureDir, 'metadata.xml'))).toBe(true);
      expect(await fs.pathExists(path.join(fixtureDir, 'screenshot.png'))).toBe(true);
    });

    it('should have fixture files for Frame 238-1790', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'figma-frames/238-1790');

      expect(await fs.pathExists(path.join(fixtureDir, 'design-context.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(fixtureDir, 'metadata.xml'))).toBe(true);
      expect(await fs.pathExists(path.join(fixtureDir, 'screenshot.png'))).toBe(true);
    });

    it('should have correct frame dimensions in metadata', async () => {
      const metadata1 = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-frames/237-2571/metadata.xml'),
        'utf-8'
      );
      expect(metadata1).toContain('width="393"');
      expect(metadata1).toContain('height="852"');

      const metadata2 = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-frames/238-1790/metadata.xml'),
        'utf-8'
      );
      expect(metadata2).toContain('width="393"');
      expect(metadata2).toContain('height="852"');
    });
  });

  describe('Dev Server Integration', () => {
    afterEach(async () => {
      await stopDevServer();
    });

    it('should start dev server successfully', async () => {
      const port = await startDevServer(TEST_PROJECT_DIR);

      // Server should be responding
      const response = await fetch(`http://localhost:${port}`);
      expect(response.ok).toBe(true);
    }, 60000);

    it('should serve figma-preview route', async () => {
      const port = await startDevServer(TEST_PROJECT_DIR);

      // Should handle figma-preview route
      const response = await fetch(`http://localhost:${port}/figma-preview?screen=TestComponent`);
      expect(response.ok).toBe(true);
    }, 60000);
  });

  describe('Skill File Structure', () => {
    it('should have SKILL.md with valid frontmatter', async () => {
      const skillMd = path.join(SKILL_DIR, 'SKILL.md');
      expect(await fs.pathExists(skillMd)).toBe(true);

      const content = await fs.readFile(skillMd, 'utf-8');

      // Should have frontmatter
      expect(content).toMatch(/^---/);
      expect(content).toContain('name: figma-to-react');
      expect(content).toContain('allowed-tools:');
    });

    it('should have all step reference files', async () => {
      const stepsDir = path.join(SKILL_DIR, 'references');
      const requiredSteps = [
        'step-1-setup.md',
        'step-2-detect-structure.md',
        'step-3-confirm-config.md',
        'step-3b-preview-route.md',
        'step-4-generation.md',
        'step-4b-validate-dimensions.md',
        'step-5-import-tokens.md',
        'step-6-validation.md',
        'step-7-rename-assets.md',
        'step-8-disarm-hook.md',
      ];

      for (const step of requiredSteps) {
        const stepPath = path.join(stepsDir, step);
        expect(await fs.pathExists(stepPath)).toBe(true);
      }
    });

    it('should have hooks configuration', async () => {
      const hooksPath = path.resolve(SKILL_DIR, '../../hooks/hooks.json');
      expect(await fs.pathExists(hooksPath)).toBe(true);

      const hooks = await fs.readJson(hooksPath);
      expect(hooks).toHaveProperty('hooks');
    });
  });

  describe('Test Project Fixture', () => {
    it('should have valid package.json', async () => {
      const pkgPath = path.join(TEST_PROJECT_DIR, 'package.json');
      expect(await fs.pathExists(pkgPath)).toBe(true);

      const pkg = await fs.readJson(pkgPath);
      expect(pkg.dependencies).toHaveProperty('react');
      expect(pkg.dependencies).toHaveProperty('react-dom');
      expect(pkg.dependencies).toHaveProperty('react-router-dom');
      expect(pkg.devDependencies).toHaveProperty('tailwindcss');
    });

    it('should have Tailwind configuration', async () => {
      const tailwindPath = path.join(TEST_PROJECT_DIR, 'tailwind.config.js');
      expect(await fs.pathExists(tailwindPath)).toBe(true);
    });

    it('should have index.css with Tailwind directives', async () => {
      const cssPath = path.join(TEST_PROJECT_DIR, 'src/index.css');
      expect(await fs.pathExists(cssPath)).toBe(true);

      const content = await fs.readFile(cssPath, 'utf-8');
      expect(content).toContain('@tailwind base');
      expect(content).toContain('@tailwind components');
      expect(content).toContain('@tailwind utilities');
    });
  });
});
