import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/fix-component-instances.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-instance-tests');

type InstanceEntry = {
  id: string;
  name: string;
  type: 'instance' | 'frame' | 'text';
  w: number;
  h: number;
};

type InstancesJson = Record<string, InstanceEntry[]>;

describe('fix-component-instances.sh - Component Instance Dimension Fixes', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  const runFixer = async (tsx: string, instances: InstancesJson): Promise<string> => {
    const tsxFile = path.join(TMP_DIR, 'input.tsx');
    const instancesFile = path.join(TMP_DIR, 'instances.json');

    await fs.writeFile(tsxFile, tsx);
    await fs.writeFile(instancesFile, JSON.stringify(instances));

    const result = execSync(`bash "${SCRIPT_PATH}" "${tsxFile}" "${instancesFile}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result;
  };

  describe('Basic Matching', () => {
    it('should add height to NavigationBar component from instance dimensions', async () => {
      const tsx = `
export default function App() {
  return (
    <div data-node-id="2006:2038">
      <NavigationBar className="bg-black relative shrink-0 w-full" />
    </div>
  );
}`;
      const instances: InstancesJson = {
        '2006:2038': [
          { id: '2006:2039', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[64px]');
      expect(result).toMatch(/<NavigationBar className="h-\[64px\]/);
    });

    it('should match component name case-insensitively', async () => {
      const tsx = `
<div data-node-id="1:1">
  <FieldLabel className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Field label', type: 'instance', w: 345, h: 32 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[32px]');
    });

    it('should match component name ignoring spaces', async () => {
      const tsx = `
<div data-node-id="1:1">
  <SelectionList className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Selection List', type: 'instance', w: 345, h: 312 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[312px]');
    });

    it('should NOT add height if component already has h-[Xpx]', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar className="h-[100px] relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[100px]');
      expect(result).not.toContain('h-[64px]');
    });

    it('should NOT add height if component has size-full', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar className="size-full relative" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('size-full');
      expect(result).not.toContain('h-[64px]');
    });
  });

  describe('Multiline Component Usages', () => {
    it('should handle component with className on separate line', async () => {
      const tsx = `
<div data-node-id="1:1">
  <FieldLabel
    className="relative shrink-0 w-full"
    labelText="Country"
  />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Field label', type: 'instance', w: 345, h: 32 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[32px]');
      expect(result).toMatch(/className="h-\[32px\]/);
    });

    it('should handle deeply indented multiline component', async () => {
      const tsx = `
<div data-node-id="1:1">
  <div className="flex">
    <div className="flex-1">
      <Select
        className="relative w-full border"
        state="default"
      />
    </div>
  </div>
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Select', type: 'instance', w: 345, h: 48 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[48px]');
    });
  });

  describe('Parent Context Tracking', () => {
    it('should use correct parent context for nested components', async () => {
      const tsx = `
<div data-node-id="root">
  <div data-node-id="parent1">
    <FieldLabel className="relative w-full" />
  </div>
  <div data-node-id="parent2">
    <FieldLabel className="relative w-full" />
  </div>
</div>`;
      const instances: InstancesJson = {
        'parent1': [
          { id: 'p1-child', name: 'Field label', type: 'instance', w: 100, h: 30 },
        ],
        'parent2': [
          { id: 'p2-child', name: 'Field label', type: 'instance', w: 200, h: 40 },
        ],
      };

      const result = await runFixer(tsx, instances);
      // Both FieldLabels should get their respective heights
      expect(result).toContain('h-[30px]');
      expect(result).toContain('h-[40px]');
    });

    it('should track parent changes correctly through document', async () => {
      const tsx = `
<div data-node-id="2006:2038">
  <NavigationBar className="relative w-full" />
  <div data-node-id="2006:2040">
    <div data-node-id="2006:2044">
      <FieldLabel className="relative w-full" />
    </div>
  </div>
</div>`;
      const instances: InstancesJson = {
        '2006:2038': [
          { id: '2006:2039', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
        '2006:2044': [
          { id: '2006:2045', name: 'Field label', type: 'instance', w: 345, h: 32 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('h-[64px]'); // NavigationBar
      expect(result).toContain('h-[32px]'); // FieldLabel
    });
  });

  describe('No Match Cases', () => {
    it('should not modify component with no matching instance', async () => {
      const tsx = `
<div data-node-id="1:1">
  <UnknownComponent className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).not.toContain('h-[64px]');
      expect(result).toContain('UnknownComponent className="relative w-full"');
    });

    it('should not modify component when parent has no instances', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '2:2': [
          { id: '2:3', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).not.toContain('h-[64px]');
    });

    it('should only match instance type, not frame or text', async () => {
      const tsx = `
<div data-node-id="1:1">
  <Content className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'content', type: 'frame', w: 393, h: 756 },
        ],
      };

      const result = await runFixer(tsx, instances);
      // frame type should not match
      expect(result).not.toContain('h-[756px]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty instances file gracefully', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar className="relative w-full" />
</div>`;
      const instances: InstancesJson = {};

      const result = await runFixer(tsx, instances);
      expect(result).toContain('NavigationBar className="relative w-full"');
    });

    it('should handle missing instances file (pass through)', async () => {
      const tsxFile = path.join(TMP_DIR, 'input.tsx');
      const tsx = `<NavigationBar className="relative w-full" />`;
      await fs.writeFile(tsxFile, tsx);

      const result = execSync(`bash "${SCRIPT_PATH}" "${tsxFile}" "/nonexistent/file.json"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result).toContain('NavigationBar className="relative w-full"');
    });

    it('should preserve all other className values', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar className="bg-black text-white flex items-center relative shrink-0 w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      expect(result).toContain('bg-black');
      expect(result).toContain('text-white');
      expect(result).toContain('flex');
      expect(result).toContain('items-center');
      expect(result).toContain('h-[64px]');
    });

    it('should handle component without className prop (skip)', async () => {
      const tsx = `
<div data-node-id="1:1">
  <NavigationBar backButton={true} exitButton={false} />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
        ],
      };

      const result = await runFixer(tsx, instances);
      // No className to modify, should pass through unchanged
      expect(result).not.toContain('h-[64px]');
    });

    it('should handle zero height gracefully', async () => {
      const tsx = `
<div data-node-id="1:1">
  <Divider className="relative w-full" />
</div>`;
      const instances: InstancesJson = {
        '1:1': [
          { id: '1:2', name: 'Divider', type: 'instance', w: 393, h: 0 },
        ],
      };

      const result = await runFixer(tsx, instances);
      // h: 0 should not add any height class
      expect(result).not.toContain('h-[0px]');
    });
  });

  describe('Real-world: PersonaScreen1 (2006:2038)', () => {
    it('should fix NavigationBar and FieldLabel components', async () => {
      const tsx = `export default function DocumentSmall() {
  return (
    <div className="bg-surface relative size-full" data-name="Document / Small 1" data-node-id="2006:2038">
      <NavigationBar className="bg-surface flex relative shrink-0 w-full" />
      <div className="flex flex-col relative w-full" data-name="content" data-node-id="2006:2040">
        <div className="flex flex-col relative w-full" data-name="country" data-node-id="2006:2044">
          <FieldLabel
            className="flex flex-col relative shrink-0 w-full"
            labelText="Issuing country"
          />
          <Select className="relative rounded shrink-0 w-full" />
        </div>
        <div className="flex flex-col relative w-full" data-name="doc" data-node-id="2006:2047">
          <FieldLabel className="flex flex-col relative shrink-0 w-full" labelText="Accepted documents" />
        </div>
      </div>
    </div>
  );
}`;
      const instances: InstancesJson = {
        '2006:2038': [
          { id: '2006:2039', name: 'Navigation Bar', type: 'instance', w: 393, h: 64 },
          { id: '2006:2040', name: 'content', type: 'frame', w: 393, h: 756 },
          { id: '2006:2050', name: 'Button Dock', type: 'instance', w: 393, h: 32 },
        ],
        '2006:2044': [
          { id: '2006:2045', name: 'Field label', type: 'instance', w: 345, h: 32 },
          { id: '2006:2046', name: 'Select', type: 'instance', w: 345, h: 48 },
        ],
        '2006:2047': [
          { id: '2006:2048', name: 'Field label', type: 'instance', w: 345, h: 32 },
          { id: '2006:2049', name: 'Selection List', type: 'instance', w: 345, h: 312 },
        ],
      };

      const result = await runFixer(tsx, instances);

      // NavigationBar should get h-[64px]
      expect(result).toMatch(/<NavigationBar className="h-\[64px\]/);

      // Both FieldLabels should get h-[32px]
      const fieldLabelMatches = result.match(/h-\[32px\]/g);
      expect(fieldLabelMatches).toHaveLength(2);

      // Select should get h-[48px]
      expect(result).toMatch(/<Select className="h-\[48px\]/);
    });
  });

  describe('Integration with Real MCP Capture', () => {
    it('should work with actual captured instances.json format', async () => {
      // Use the instances.json we generated from real XML
      const instancesFile = '/tmp/figma-to-react/metadata/2006-2038-instances.json';
      const captureFile = '/tmp/figma-to-react/captures/figma-2006-2038.txt';

      // Skip if test files don't exist
      if (!await fs.pathExists(instancesFile) || !await fs.pathExists(captureFile)) {
        return;
      }

      const result = execSync(`bash "${SCRIPT_PATH}" "${captureFile}" "${instancesFile}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // NavigationBar should be fixed
      expect(result).toMatch(/<NavigationBar className="h-\[64px\]/);
    });
  });
});
