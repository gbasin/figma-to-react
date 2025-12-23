import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/fix-collapsed-containers.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-collapsed-tests');

describe('fix-collapsed-containers.sh - Collapsed Container Detection', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  const runFixer = async (tsx: string, dimensions: Record<string, { w: number; h: number }>): Promise<string> => {
    const tsxFile = path.join(TMP_DIR, 'input.tsx');
    const dimFile = path.join(TMP_DIR, 'dimensions.json');

    await fs.writeFile(tsxFile, tsx);
    await fs.writeFile(dimFile, JSON.stringify(dimensions));

    const result = execSync(`bash "${SCRIPT_PATH}" "${tsxFile}" "${dimFile}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result;
  };

  describe('Detection', () => {
    it('should detect element with padding and no explicit height', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child 1</div>
          <div className="absolute">Child 2</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-[64px]');
    });

    it('should NOT fix element that already has explicit h-[Xpx]', async () => {
      const tsx = `
        <div className="h-[100px] py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      // Should keep original h-[100px], not add h-[64px]
      expect(result).toContain('h-[100px]');
      expect(result).not.toContain('h-[64px]');
    });

    it('should NOT fix element with h-full class', async () => {
      const tsx = `
        <div className="h-full py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-full');
      expect(result).not.toContain('h-[64px]');
    });

    it('should NOT fix element with size-full class', async () => {
      const tsx = `
        <div className="size-full py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('size-full');
      expect(result).not.toContain('h-[64px]');
    });

    it('should NOT fix element without relative/absolute positioning', async () => {
      const tsx = `
        <div className="py-[8px] flex" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).not.toContain('h-[64px]');
    });
  });

  describe('Fixing', () => {
    it('should add h-[64px] to Navigation Bar', async () => {
      const tsx = `
        <div className="bg-black py-[8px] relative shrink-0 w-full" data-name="Navigation Bar" data-node-id="237:2572">
          <div className="absolute right-[12px]">Exit</div>
          <div className="absolute left-[12px]">Back</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-[64px]');
      expect(result).toContain('data-node-id="237:2572"');
    });

    it('should add w-[Xpx] when width collapse detected', async () => {
      const tsx = `
        <div className="px-[8px] relative" data-node-id="237:2577">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2577': { w: 148, h: 168 } };

      const result = await runFixer(tsx, dims);
      // Only has px-[8px] (horizontal padding), so only width collapses
      expect(result).toContain('w-[148px]');
    });

    it('should add both h-[Xpx] and w-[Xpx] when both collapse', async () => {
      const tsx = `
        <div className="p-[8px] relative" data-node-id="237:2577">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2577': { w: 148, h: 168 } };

      const result = await runFixer(tsx, dims);
      // Has p-[8px] (both paddings), so both dimensions collapse
      expect(result).toContain('h-[168px]');
      expect(result).toContain('w-[148px]');
    });

    it('should preserve existing classes when adding dimension', async () => {
      const tsx = `
        <div className="bg-black py-[8px] relative flex items-center" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('bg-black');
      expect(result).toContain('py-[8px]');
      expect(result).toContain('relative');
      expect(result).toContain('flex');
      expect(result).toContain('items-center');
      expect(result).toContain('h-[64px]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle element without data-node-id (skip)', async () => {
      const tsx = `
        <div className="py-[8px] relative">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      // Should pass through unchanged
      expect(result).not.toContain('h-[64px]');
    });

    it('should handle missing metadata dimension (skip)', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="999:999">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      // Node 999:999 not in dimensions, should skip
      expect(result).not.toContain('h-[');
    });

    it('should handle complex node IDs with semicolons', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="I237:2572;2708:1961">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { 'I237:2572;2708:1961': { w: 48, h: 48 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-[48px]');
    });

    it('should NOT add width when element has w-full', async () => {
      const tsx = `
        <div className="px-[8px] py-[8px] relative w-full" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-[64px]');
      expect(result).not.toContain('w-[393px]');
    });

    it('should handle escaped slashes in var() values', async () => {
      const tsx = `
        <div className="py-[var(--space\\/1,8px)] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-[64px]');
    });
  });

  describe('Real-world: Onfido Navigation Bar', () => {
    it('should fix the actual Navigation Bar from Onfido design', async () => {
      const tsx = `<div className="bg-[var(--background\\/overlay,rgba(0,0,0,0.8))] content-stretch flex gap-[var(--space\\/1,8px)] isolate items-start px-[var(--space\\/1_5,12px)] py-[var(--space\\/1,8px)] relative shrink-0 w-full z-[6]" data-name="Navigation Bar" data-node-id="237:2572">
  <div className="absolute content-stretch flex flex-col h-[48px] items-center justify-center overflow-clip right-[12px] rounded-[var(--border-radius\\/medium,4px)] top-1/2 translate-y-[-50%] z-[2]" data-name="exit button" data-node-id="I237:2572;2708:1961">
  </div>
  <div className="absolute content-stretch flex flex-col h-[48px] items-center justify-center left-[12px] overflow-clip rounded-[var(--border-radius\\/medium,4px)] top-1/2 translate-y-[-50%] z-[1]" data-name="back button" data-node-id="I237:2572;2708:1962">
  </div>
</div>`;
      const dims = {
        '237:2572': { w: 393, h: 64 },
        'I237:2572;2708:1961': { w: 48, h: 48 },
        'I237:2572;2708:1962': { w: 48, h: 48 },
      };

      const result = await runFixer(tsx, dims);

      // Navigation Bar should get h-[64px]
      expect(result).toMatch(/h-\[64px\].*data-node-id="237:2572"/);

      // Check it's at the start of className (where we insert)
      expect(result).toMatch(/className="h-\[64px\]/);
    });
  });
});
