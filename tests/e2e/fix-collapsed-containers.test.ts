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

  const runFixer = async (tsx: string, dimensions: Record<string, { w: number; h: number; manual?: boolean }>): Promise<string> => {
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

  describe('Real MCP Capture: Motion Mobile (237:2571)', () => {
    it('should fix collapsed containers in actual Figma MCP output', async () => {
      const tsxFile = path.resolve(__dirname, 'fixtures/mcp-captures/figma-237-2571.txt');
      const dimFile = path.resolve(__dirname, 'fixtures/mcp-captures/237-2571-dimensions.json');

      const result = execSync(`bash "${SCRIPT_PATH}" "${tsxFile}" "${dimFile}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Should map the extracted components
      // HeadTurnPictogram and MotionFrame have className={className} pattern

      // Navigation Bar (237:2572) should get h-[64px] - inline element with py-[...] relative
      expect(result).toMatch(/h-\[64px\].*data-node-id="237:2572"/);

      // Other inline collapsed containers should be fixed
      // 237:2577 has py-[...] relative pattern
      expect(result).toContain('h-[168px]');
      expect(result).toContain('w-[148px]');

      // 237:2578 - content area
      expect(result).toContain('h-[294px]');

      // Verify component mappings were detected
      // (these components use className={className} pattern)
    });
  });

  describe('Manual vs Figma MCP Dimensions', () => {
    it('should NOT replace h-full with Figma MCP dimensions (no manual flag)', async () => {
      const tsx = `
        <div className="h-full py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      // No manual flag = Figma MCP dimension = conservative behavior
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-full');
      expect(result).not.toContain('h-[64px]');
    });

    it('should REPLACE h-full with manual dimensions (manual: true)', async () => {
      const tsx = `
        <div className="h-full py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      // manual: true = manually added dimension = aggressive behavior
      const dims = { '237:2572': { w: 393, h: 64, manual: true } };

      const result = await runFixer(tsx, dims);
      expect(result).not.toContain('h-full');
      expect(result).toContain('h-[64px]');
    });

    it('should NOT replace w-full with Figma MCP dimensions', async () => {
      const tsx = `
        <div className="w-full px-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('w-full');
      expect(result).not.toContain('w-[393px]');
    });

    it('should REPLACE w-full with manual dimensions', async () => {
      const tsx = `
        <div className="w-full px-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64, manual: true } };

      const result = await runFixer(tsx, dims);
      expect(result).not.toContain('w-full');
      expect(result).toContain('w-[393px]');
    });

    it('should REPLACE h-auto with manual dimensions', async () => {
      const tsx = `
        <div className="h-auto py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64, manual: true } };

      const result = await runFixer(tsx, dims);
      expect(result).not.toContain('h-auto');
      expect(result).toContain('h-[64px]');
    });

    it('should REPLACE h-fit with manual dimensions', async () => {
      const tsx = `
        <div className="h-fit py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64, manual: true } };

      const result = await runFixer(tsx, dims);
      expect(result).not.toContain('h-fit');
      expect(result).toContain('h-[64px]');
    });

    it('should NOT replace h-auto with Figma MCP dimensions', async () => {
      const tsx = `
        <div className="h-auto py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);
      expect(result).toContain('h-auto');
      expect(result).not.toContain('h-[64px]');
    });

    it('should handle mixed manual and non-manual dimensions', async () => {
      const tsx = `
        <div className="h-full py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child 1</div>
        </div>
        <div className="h-full py-[8px] relative" data-node-id="1:2">
          <div className="absolute">Child 2</div>
        </div>
      `;
      const dims = {
        '1:1': { w: 100, h: 50 },           // Figma MCP - keep h-full
        '1:2': { w: 100, h: 60, manual: true }, // Manual - replace h-full
      };

      const result = await runFixer(tsx, dims);
      // First element: h-full preserved (className comes before data-node-id)
      expect(result).toMatch(/h-full[^>]*data-node-id="1:1"/s);
      // Second element: h-full replaced with h-[60px]
      expect(result).toMatch(/h-\[60px\][^>]*data-node-id="1:2"/s);
      expect(result).not.toMatch(/h-full[^>]*data-node-id="1:2"/s);
    });

    it('should add dimensions to element without relative sizing (both modes)', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child 1</div>
        </div>
        <div className="py-[8px] relative" data-node-id="1:2">
          <div className="absolute">Child 2</div>
        </div>
      `;
      const dims = {
        '1:1': { w: 100, h: 50 },           // Figma MCP
        '1:2': { w: 100, h: 60, manual: true }, // Manual
      };

      const result = await runFixer(tsx, dims);
      // Both should get explicit heights added (no relative sizing to preserve)
      expect(result).toContain('h-[50px]');
      expect(result).toContain('h-[60px]');
    });
  });

  describe('Component Usage Fixes (Two-Pass)', () => {
    it('should map component definition to node-id and fix usage site', async () => {
      const tsx = `function NavigationBar({ className }: { className?: string }) {
  return (
    <div data-node-id="237:2572" className={className}>
      <div className="absolute">child</div>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <NavigationBar className="py-[8px] relative px-[12px]" />
    </div>
  );
}`;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);

      // Component usage should get both h-[64px] and w-[393px]
      expect(result).toContain('h-[64px]');
      expect(result).toContain('w-[393px]');
      // Fix should be applied to the usage line, not the definition
      expect(result).toMatch(/<NavigationBar className="[^"]*h-\[64px\]/);
    });

    it('should fix only height when width has w-full at usage site', async () => {
      const tsx = `function NavigationBar({ className }: { className?: string }) {
  return (
    <div data-node-id="237:2572" className={className}>
      <div className="absolute">child</div>
    </div>
  );
}

export default function App() {
  return (
    <NavigationBar className="py-[8px] relative w-full" />
  );
}`;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);

      expect(result).toContain('h-[64px]');
      expect(result).not.toContain('w-[393px]');
    });

    it('should handle multiple extracted components', async () => {
      const tsx = `function HeadTurnPictogram({ className }: { className?: string }) {
  return (
    <div data-node-id="238:1725" className={className}>
      <div className="absolute">head</div>
    </div>
  );
}

function MotionFrame({ className }: { className?: string }) {
  return (
    <div data-node-id="238:1678" className={className}>
      <div className="absolute">frame</div>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <HeadTurnPictogram className="py-[10px] relative" />
      <MotionFrame className="px-[20px] relative" />
    </div>
  );
}`;
      const dims = {
        '238:1725': { w: 84, h: 104 },
        '238:1678': { w: 259, h: 366 },
      };

      const result = await runFixer(tsx, dims);

      // HeadTurnPictogram should get h-[104px] (has py-[10px])
      expect(result).toMatch(/<HeadTurnPictogram className="[^"]*h-\[104px\]/);
      // MotionFrame should get w-[259px] (has px-[20px])
      expect(result).toMatch(/<MotionFrame className="[^"]*w-\[259px\]/);
    });

    it('should NOT fix component usage without collapse pattern', async () => {
      const tsx = `function NavigationBar({ className }: { className?: string }) {
  return (
    <div data-node-id="237:2572" className={className}>
      <div className="absolute">child</div>
    </div>
  );
}

export default function App() {
  return (
    <NavigationBar className="flex items-center" />
  );
}`;
      const dims = { '237:2572': { w: 393, h: 64 } };

      const result = await runFixer(tsx, dims);

      // No padding, no relative/absolute in usage - should not fix
      expect(result).not.toContain('h-[64px]');
      expect(result).not.toContain('w-[393px]');
    });

    it('should handle inline elements AND component usages in same file', async () => {
      const tsx = `function Header({ className }: { className?: string }) {
  return (
    <div data-node-id="100:1" className={className}>
      <div className="absolute">header content</div>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <Header className="py-[8px] relative" />
      <div className="py-[16px] relative" data-node-id="200:2">
        <div className="absolute">inline content</div>
      </div>
    </div>
  );
}`;
      const dims = {
        '100:1': { w: 300, h: 50 },
        '200:2': { w: 400, h: 100 },
      };

      const result = await runFixer(tsx, dims);

      // Component usage should be fixed
      expect(result).toMatch(/<Header className="[^"]*h-\[50px\]/);
      // Inline element should also be fixed
      expect(result).toMatch(/h-\[100px\].*data-node-id="200:2"/);
    });
  });

  describe('Batch Processing', () => {
    const runBatchFixer = (args: string): { exitCode: number } => {
      try {
        execSync(`bash "${SCRIPT_PATH}" ${args}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: TMP_DIR,
        });
        return { exitCode: 0 };
      } catch (err: any) {
        return { exitCode: err.status || 1 };
      }
    };

    describe('Multiple pairs mode (--pair)', () => {
      it('should process multiple --pair arguments', async () => {
        const tsx1 = `<div className="py-[8px] relative" data-node-id="1:1"><div className="absolute">Child</div></div>`;
        const tsx2 = `<div className="px-[8px] relative" data-node-id="2:2"><div className="absolute">Child</div></div>`;

        const file1 = path.join(TMP_DIR, 'Component1.tsx');
        const file2 = path.join(TMP_DIR, 'Component2.tsx');
        const dims1 = path.join(TMP_DIR, '1-1-dimensions.json');
        const dims2 = path.join(TMP_DIR, '2-2-dimensions.json');

        await fs.writeFile(file1, tsx1);
        await fs.writeFile(file2, tsx2);
        await fs.writeFile(dims1, JSON.stringify({ '1:1': { w: 100, h: 50 } }));
        await fs.writeFile(dims2, JSON.stringify({ '2:2': { w: 200, h: 100 } }));

        runBatchFixer(`--pair "${file1}" "${dims1}" --pair "${file2}" "${dims2}"`);

        const result1 = await fs.readFile(file1, 'utf-8');
        const result2 = await fs.readFile(file2, 'utf-8');

        expect(result1).toContain('h-[50px]');
        expect(result2).toContain('w-[200px]');
      });

      it('should fix each pair in-place', async () => {
        const tsx = `<div className="py-[8px] relative" data-node-id="1:1"><div className="absolute">Child</div></div>`;
        const file = path.join(TMP_DIR, 'Component.tsx');
        const dims = path.join(TMP_DIR, 'dimensions.json');

        await fs.writeFile(file, tsx);
        await fs.writeFile(dims, JSON.stringify({ '1:1': { w: 100, h: 50 } }));

        const originalContent = tsx;
        runBatchFixer(`--pair "${file}" "${dims}"`);

        const result = await fs.readFile(file, 'utf-8');
        expect(result).not.toBe(originalContent);
        expect(result).toContain('h-[50px]');
      });

      it('should fail if tsx file not found', async () => {
        const dims = path.join(TMP_DIR, 'dimensions.json');
        await fs.writeFile(dims, JSON.stringify({}));

        const { exitCode } = runBatchFixer(`--pair "${TMP_DIR}/nonexistent.tsx" "${dims}"`);
        expect(exitCode).toBe(1);
      });
    });

    describe('Directory mode', () => {
      it('should process all tsx/dimensions pairs in directories', async () => {
        const tsxDir = path.join(TMP_DIR, 'components');
        const dimsDir = path.join(TMP_DIR, 'metadata');
        await fs.ensureDir(tsxDir);
        await fs.ensureDir(dimsDir);

        // Component that references node 237:2571
        const tsx1 = `<div className="py-[8px] relative" data-node-id="237:2571"><div className="absolute">Child</div></div>`;
        // Component that references node 237:2416
        const tsx2 = `<div className="px-[8px] relative" data-node-id="237:2416"><div className="absolute">Child</div></div>`;

        await fs.writeFile(path.join(tsxDir, 'Screen1.tsx'), tsx1);
        await fs.writeFile(path.join(tsxDir, 'Screen2.tsx'), tsx2);
        await fs.writeFile(path.join(dimsDir, '237-2571-dimensions.json'), JSON.stringify({ '237:2571': { w: 393, h: 64 } }));
        await fs.writeFile(path.join(dimsDir, '237-2416-dimensions.json'), JSON.stringify({ '237:2416': { w: 200, h: 50 } }));

        runBatchFixer(`"${tsxDir}" "${dimsDir}"`);

        const result1 = await fs.readFile(path.join(tsxDir, 'Screen1.tsx'), 'utf-8');
        const result2 = await fs.readFile(path.join(tsxDir, 'Screen2.tsx'), 'utf-8');

        expect(result1).toContain('h-[64px]');
        expect(result2).toContain('w-[200px]');
      });

      it('should auto-match by nodeId pattern', async () => {
        const tsxDir = path.join(TMP_DIR, 'components');
        const dimsDir = path.join(TMP_DIR, 'metadata');
        await fs.ensureDir(tsxDir);
        await fs.ensureDir(dimsDir);

        // TSX with specific node ID
        const tsx = `<div className="p-[8px] relative" data-node-id="2006:2038"><div className="absolute">Child</div></div>`;
        await fs.writeFile(path.join(tsxDir, 'PersonaScreen1.tsx'), tsx);

        // Matching dimensions file (node ID 2006:2038 -> filename 2006-2038-dimensions.json)
        await fs.writeFile(path.join(dimsDir, '2006-2038-dimensions.json'), JSON.stringify({ '2006:2038': { w: 300, h: 400 } }));

        runBatchFixer(`"${tsxDir}" "${dimsDir}"`);

        const result = await fs.readFile(path.join(tsxDir, 'PersonaScreen1.tsx'), 'utf-8');
        expect(result).toContain('h-[400px]');
        expect(result).toContain('w-[300px]');
      });

      it('should skip unmatched files with warning', async () => {
        const tsxDir = path.join(TMP_DIR, 'components');
        const dimsDir = path.join(TMP_DIR, 'metadata');
        await fs.ensureDir(tsxDir);
        await fs.ensureDir(dimsDir);

        // TSX with node ID that has no matching dimensions file
        const tsx = `<div className="py-[8px] relative" data-node-id="999:999"><div className="absolute">Child</div></div>`;
        await fs.writeFile(path.join(tsxDir, 'Unmatched.tsx'), tsx);

        // Dimensions for different node ID
        await fs.writeFile(path.join(dimsDir, '1-1-dimensions.json'), JSON.stringify({ '1:1': { w: 100, h: 50 } }));

        const { exitCode } = runBatchFixer(`"${tsxDir}" "${dimsDir}"`);

        // Should complete (exit 0) but file should be unchanged
        expect(exitCode).toBe(0);
        const result = await fs.readFile(path.join(tsxDir, 'Unmatched.tsx'), 'utf-8');
        expect(result).toBe(tsx); // Unchanged
      });
    });

    describe('Backward compatibility', () => {
      it('should still output to stdout with single file pair', async () => {
        const tsx = `<div className="py-[8px] relative" data-node-id="1:1"><div className="absolute">Child</div></div>`;
        const dims = { '1:1': { w: 100, h: 50 } };

        const result = await runFixer(tsx, dims);
        expect(result).toContain('h-[50px]');
      });
    });
  });
});
