import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/validate-dimensions-coverage.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-validate-dims-tests');

describe('validate-dimensions-coverage.sh', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
    await fs.ensureDir(path.join(TMP_DIR, 'captures'));
    await fs.ensureDir(path.join(TMP_DIR, 'metadata'));
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  const runValidator = (args: string): { stdout: string; exitCode: number } => {
    try {
      const stdout = execSync(`bash "${SCRIPT_PATH}" ${args}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: TMP_DIR,
      });
      return { stdout, exitCode: 0 };
    } catch (err: any) {
      return { stdout: err.stdout || '', exitCode: err.status || 1 };
    }
  };

  const createTsx = async (filename: string, content: string) => {
    await fs.writeFile(path.join(TMP_DIR, filename), content);
  };

  const createCapture = async (nodeId: string, content: string) => {
    await fs.writeFile(path.join(TMP_DIR, 'captures', `figma-${nodeId}.txt`), content);
  };

  const createDimensions = async (nodeId: string, dims: Record<string, { w: number; h: number }>) => {
    await fs.writeFile(path.join(TMP_DIR, 'metadata', `${nodeId}-dimensions.json`), JSON.stringify(dims));
  };

  describe('Single File Mode', () => {
    it('should validate a single file pair', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="237:2572" data-name="Navigation Bar">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = { '237:2572': { w: 393, h: 64 } };

      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify(dims));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(0);
    });

    it('should report missing dimensions', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="237:2572" data-name="Navigation Bar">
          <div className="absolute">Child</div>
        </div>
      `;
      const dims = {}; // No dimensions

      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify(dims));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(1);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(1);
      expect(json.files[0].missing[0].id).toBe('237:2572');
      expect(json.files[0].missing[0].name).toBe('Navigation Bar');
    });

    it('should not report non-collapse-prone missing dimensions by default', async () => {
      const tsx = `
        <div className="flex items-center" data-node-id="237:2572" data-name="Static Element">
          <div>Child</div>
        </div>
      `;
      const dims = {}; // No dimensions

      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify(dims));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0); // No collapse-prone elements
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(0);
      expect(json.files[0].total_missing).toBe(1); // Still missing but not critical
    });

    it('should report all missing with --all flag', async () => {
      const tsx = `
        <div className="flex items-center" data-node-id="237:2572" data-name="Static Element">
          <div>Child</div>
        </div>
      `;
      const dims = {}; // No dimensions

      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify(dims));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json" --all`);
      expect(exitCode).toBe(1);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing.length).toBe(1);
    });
  });

  describe('Directory Mode', () => {
    it('should validate all files in directories', async () => {
      // Create two screens
      await createCapture('237-2571', `
        <div className="py-[8px] relative" data-node-id="237:2572" data-name="Nav1">
          <div className="absolute">Child</div>
        </div>
      `);
      await createCapture('237-2416', `
        <div className="px-[8px] relative" data-node-id="237:2417" data-name="Nav2">
          <div className="absolute">Child</div>
        </div>
      `);

      // Create matching dimensions
      await createDimensions('237-2571', { '237:2572': { w: 393, h: 64 } });
      await createDimensions('237-2416', { '237:2417': { w: 200, h: 50 } });

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/captures/" "${TMP_DIR}/metadata/"`);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.total_files).toBe(2);
      expect(json.total_critical_missing).toBe(0);
    });

    it('should report missing dimensions across multiple files', async () => {
      await createCapture('237-2571', `
        <div className="py-[8px] relative" data-node-id="237:2572" data-name="Missing1">
          <div className="absolute">Child</div>
        </div>
      `);
      await createCapture('237-2416', `
        <div className="px-[8px] relative" data-node-id="237:2417" data-name="Missing2">
          <div className="absolute">Child</div>
        </div>
      `);

      // Create empty dimensions
      await createDimensions('237-2571', {});
      await createDimensions('237-2416', {});

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/captures/" "${TMP_DIR}/metadata/"`);
      expect(exitCode).toBe(1);
      const json = JSON.parse(stdout);
      expect(json.total_files).toBe(2);
      expect(json.total_critical_missing).toBe(2);
    });

    it('should warn about unmatched files but still process matched ones', async () => {
      await createCapture('237-2571', `
        <div className="py-[8px] relative" data-node-id="237:2572">
          <div className="absolute">Child</div>
        </div>
      `);
      await createCapture('237-2416', `
        <div className="px-[8px] relative" data-node-id="237:2417">
          <div className="absolute">Child</div>
        </div>
      `);
      // Only one matching dimensions file
      await createDimensions('237-2571', { '237:2572': { w: 393, h: 64 } });
      // No dimensions for 237-2416

      const { stdout } = runValidator(`"${TMP_DIR}/captures/" "${TMP_DIR}/metadata/"`);
      const json = JSON.parse(stdout);
      // Should only process the matched file
      expect(json.total_files).toBe(1);
    });
  });

  describe('Multi-File Mode', () => {
    it('should validate specific files with metadata directory', async () => {
      await createCapture('237-2571', `
        <div className="py-[8px] relative" data-node-id="237:2572" data-name="Screen1">
          <div className="absolute">Child</div>
        </div>
      `);
      await createCapture('237-2416', `
        <div className="px-[8px] relative" data-node-id="237:2417" data-name="Screen2">
          <div className="absolute">Child</div>
        </div>
      `);
      await createCapture('999-999', `
        <div className="py-[8px] relative" data-node-id="999:999" data-name="Unselected">
          <div className="absolute">Child</div>
        </div>
      `);

      await createDimensions('237-2571', { '237:2572': { w: 393, h: 64 } });
      await createDimensions('237-2416', { '237:2417': { w: 200, h: 50 } });
      await createDimensions('999-999', {}); // Would fail if selected

      // Only select first two files
      const { stdout, exitCode } = runValidator(
        `"${TMP_DIR}/captures/figma-237-2571.txt" "${TMP_DIR}/captures/figma-237-2416.txt" "${TMP_DIR}/metadata/"`
      );
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.total_files).toBe(2);
      expect(json.total_critical_missing).toBe(0);
    });
  });

  describe('Collapse Pattern Detection', () => {
    it('should detect vertical collapse pattern (py-[...])', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(1);
    });

    it('should detect horizontal collapse pattern (px-[...])', async () => {
      const tsx = `
        <div className="px-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(1);
    });

    it('should detect all-sides collapse pattern (p-[...])', async () => {
      const tsx = `
        <div className="p-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(1);
    });

    it('should NOT flag element without positioning', async () => {
      const tsx = `
        <div className="py-[8px] flex" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(0);
    });

    it('should NOT flag element with explicit height', async () => {
      const tsx = `
        <div className="h-[100px] py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.files[0].critical_missing).toBe(0);
    });

    it('should NOT flag element with h-full', async () => {
      const tsx = `
        <div className="h-full py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
    });

    it('should NOT flag element with size-full', async () => {
      const tsx = `
        <div className="size-full py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout, exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
    });
  });

  describe('Complex Node IDs', () => {
    it('should handle instance IDs with semicolons', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="I237:2572;2708:1961" data-name="Instance">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing[0].id).toBe('I237:2572;2708:1961');
    });

    it('should handle deeply nested instance IDs', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="I237:2572;2708:1961;2026:14620" data-name="Deep">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing[0].id).toBe('I237:2572;2708:1961;2026:14620');
    });
  });

  describe('Name Extraction', () => {
    it('should extract name from data-name attribute', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="1:1" data-name="My Component">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing[0].name).toBe('My Component');
    });

    it('should extract name from component tag when data-name missing', async () => {
      const tsx = `
        <NavigationBar className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </NavigationBar>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing[0].name).toBe('NavigationBar');
    });

    it('should use "unknown" when no name available', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      expect(json.files[0].missing[0].name).toBe('unknown');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty TSX file', async () => {
      await createTsx('input.tsx', '');
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
    });

    it('should handle TSX with no node IDs', async () => {
      const tsx = `
        <div className="py-[8px] relative">
          <div className="absolute">Child</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { exitCode } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      expect(exitCode).toBe(0);
    });

    it('should deduplicate repeated node IDs', async () => {
      const tsx = `
        <div className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child</div>
        </div>
        <div className="py-[8px] relative" data-node-id="1:1">
          <div className="absolute">Child 2</div>
        </div>
      `;
      await createTsx('input.tsx', tsx);
      await fs.writeFile(path.join(TMP_DIR, 'dims.json'), JSON.stringify({}));

      const { stdout } = runValidator(`"${TMP_DIR}/input.tsx" "${TMP_DIR}/dims.json"`);
      const json = JSON.parse(stdout);
      // Should only report once
      expect(json.files[0].missing.length).toBe(1);
    });
  });

  describe('Real MCP Capture Integration', () => {
    it('should validate actual MCP capture file', async () => {
      const capturePath = path.resolve(__dirname, 'fixtures/mcp-captures/figma-237-2571.txt');
      const dimsPath = path.resolve(__dirname, 'fixtures/mcp-captures/237-2571-dimensions.json');

      if (!(await fs.pathExists(capturePath)) || !(await fs.pathExists(dimsPath))) {
        console.log('Skipping: MCP capture fixtures not found');
        return;
      }

      const { stdout, exitCode } = runValidator(`"${capturePath}" "${dimsPath}"`);
      const json = JSON.parse(stdout);

      // Should complete without error
      expect(json.files).toHaveLength(1);
      expect(typeof json.files[0].critical_missing).toBe('number');
    });
  });
});
