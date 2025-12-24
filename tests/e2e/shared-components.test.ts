import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-shared-components-tests');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/mcp-captures');

/**
 * Extract the component definition ID from an instance node ID.
 *
 * Instance IDs follow the pattern: I{parent};{component}[;{nested}...]
 * The last segment is typically the component definition ID.
 *
 * Examples:
 * - "I237:2572;2708:1961" → "2708:1961" (exit button component)
 * - "I237:2417;2708:1961" → "2708:1961" (same exit button, different screen)
 * - "I237:2428;2603:5165" → "2603:5165" (footer component)
 */
function extractComponentDefinitionId(instanceId: string): string | null {
  if (!instanceId.startsWith('I')) {
    return null; // Not an instance ID
  }

  // Get the last segment after the last semicolon
  const parts = instanceId.split(';');
  if (parts.length < 2) {
    return null;
  }

  return parts[parts.length - 1];
}

/**
 * Extract all node IDs from a Figma MCP capture file.
 */
function extractNodeIds(captureContent: string): string[] {
  const nodeIdPattern = /data-node-id="([^"]+)"/g;
  const matches = captureContent.matchAll(nodeIdPattern);
  return [...matches].map(m => m[1]);
}

/**
 * Extract element name from data-name attribute for a given node ID.
 */
function extractElementName(captureContent: string, nodeId: string): string | null {
  // Escape special regex chars in nodeId
  const escapedId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`data-name="([^"]+)"[^>]*data-node-id="${escapedId}"|data-node-id="${escapedId}"[^>]*data-name="([^"]+)"`);
  const match = captureContent.match(pattern);
  return match ? (match[1] || match[2]) : null;
}

interface SharedComponent {
  definitionId: string;
  name: string | null;
  instances: Array<{
    instanceId: string;
    screenNodeId: string;
  }>;
}

/**
 * Find shared components across multiple screen captures.
 */
function findSharedComponents(captures: Array<{ screenNodeId: string; content: string }>): SharedComponent[] {
  // Map: definitionId → instances
  const componentMap = new Map<string, SharedComponent>();

  for (const capture of captures) {
    const nodeIds = extractNodeIds(capture.content);

    for (const nodeId of nodeIds) {
      const definitionId = extractComponentDefinitionId(nodeId);
      if (!definitionId) continue;

      if (!componentMap.has(definitionId)) {
        componentMap.set(definitionId, {
          definitionId,
          name: extractElementName(capture.content, nodeId),
          instances: [],
        });
      }

      const component = componentMap.get(definitionId)!;

      // Avoid duplicates within same screen
      const alreadyAdded = component.instances.some(
        i => i.instanceId === nodeId && i.screenNodeId === capture.screenNodeId
      );

      if (!alreadyAdded) {
        component.instances.push({
          instanceId: nodeId,
          screenNodeId: capture.screenNodeId,
        });
      }
    }
  }

  // Filter to only components that appear in multiple screens
  return [...componentMap.values()].filter(c => {
    const uniqueScreens = new Set(c.instances.map(i => i.screenNodeId));
    return uniqueScreens.size > 1;
  });
}

describe('Shared Component Detection', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  describe('extractComponentDefinitionId', () => {
    it('should extract component ID from simple instance ID', () => {
      expect(extractComponentDefinitionId('I237:2572;2708:1961')).toBe('2708:1961');
    });

    it('should extract component ID from deeply nested instance ID', () => {
      expect(extractComponentDefinitionId('I237:2417;2708:1961;2026:14620')).toBe('2026:14620');
    });

    it('should return null for non-instance IDs', () => {
      expect(extractComponentDefinitionId('237:2572')).toBeNull();
    });

    it('should return null for instance ID without semicolon', () => {
      expect(extractComponentDefinitionId('I237:2572')).toBeNull();
    });
  });

  describe('extractNodeIds', () => {
    it('should extract all node IDs from capture content', () => {
      const content = `
        <div data-node-id="237:2571">
          <div data-node-id="I237:2572;2708:1961">exit</div>
          <div data-node-id="I237:2572;2708:1962">back</div>
        </div>
      `;

      const nodeIds = extractNodeIds(content);
      expect(nodeIds).toContain('237:2571');
      expect(nodeIds).toContain('I237:2572;2708:1961');
      expect(nodeIds).toContain('I237:2572;2708:1962');
      expect(nodeIds).toHaveLength(3);
    });
  });

  describe('findSharedComponents - Unit Tests', () => {
    it('should find components shared between two screens', () => {
      const screen1 = {
        screenNodeId: '237:2416',
        content: `
          <div data-node-id="237:2416">
            <div data-name="exit button" data-node-id="I237:2417;2708:1961">exit</div>
            <div data-name="back button" data-node-id="I237:2417;2708:1962">back</div>
            <div data-name="footer" data-node-id="I237:2428;2603:5165">footer</div>
          </div>
        `,
      };

      const screen2 = {
        screenNodeId: '237:2571',
        content: `
          <div data-node-id="237:2571">
            <div data-name="exit button" data-node-id="I237:2572;2708:1961">exit</div>
            <div data-name="back button" data-node-id="I237:2572;2708:1962">back</div>
            <div data-name="footer" data-node-id="I237:2583;2603:5165">footer</div>
          </div>
        `,
      };

      const shared = findSharedComponents([screen1, screen2]);

      // Should find 3 shared components
      expect(shared.length).toBe(3);

      // Check exit button
      const exitButton = shared.find(c => c.definitionId === '2708:1961');
      expect(exitButton).toBeDefined();
      expect(exitButton?.name).toBe('exit button');
      expect(exitButton?.instances).toHaveLength(2);
      expect(exitButton?.instances.map(i => i.screenNodeId)).toContain('237:2416');
      expect(exitButton?.instances.map(i => i.screenNodeId)).toContain('237:2571');

      // Check footer
      const footer = shared.find(c => c.definitionId === '2603:5165');
      expect(footer).toBeDefined();
      expect(footer?.name).toBe('footer');
    });

    it('should NOT include components that only appear in one screen', () => {
      const screen1 = {
        screenNodeId: '237:2416',
        content: `
          <div data-node-id="237:2416">
            <div data-name="unique element" data-node-id="I237:2417;9999:1111">unique</div>
            <div data-name="shared button" data-node-id="I237:2417;2708:1961">shared</div>
          </div>
        `,
      };

      const screen2 = {
        screenNodeId: '237:2571',
        content: `
          <div data-node-id="237:2571">
            <div data-name="shared button" data-node-id="I237:2572;2708:1961">shared</div>
          </div>
        `,
      };

      const shared = findSharedComponents([screen1, screen2]);

      // Should only find the shared button, not the unique element
      expect(shared.length).toBe(1);
      expect(shared[0].definitionId).toBe('2708:1961');
    });

    it('should handle deeply nested shared components', () => {
      const screen1 = {
        screenNodeId: '237:2416',
        content: `
          <div data-name="padding" data-node-id="I237:2417;2708:1961;2026:14620">
            <div data-name="icon" data-node-id="I237:2417;2708:1961;2026:14620;632:805">icon</div>
          </div>
        `,
      };

      const screen2 = {
        screenNodeId: '237:2571',
        content: `
          <div data-name="padding" data-node-id="I237:2572;2708:1961;2026:14620">
            <div data-name="icon" data-node-id="I237:2572;2708:1961;2026:14620;632:805">icon</div>
          </div>
        `,
      };

      const shared = findSharedComponents([screen1, screen2]);

      // Should find padding (2026:14620) and icon (632:805)
      expect(shared.length).toBe(2);
      expect(shared.map(c => c.definitionId)).toContain('2026:14620');
      expect(shared.map(c => c.definitionId)).toContain('632:805');
    });
  });

  describe('findSharedComponents - Real Onfido Fixtures', () => {
    it('should find shared components between Motion Mobile 2 and Motion Mobile 3', async () => {
      const screen1Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2416.txt'),
        'utf-8'
      );
      const screen2Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2571.txt'),
        'utf-8'
      );

      const shared = findSharedComponents([
        { screenNodeId: '237:2416', content: screen1Content },
        { screenNodeId: '237:2571', content: screen2Content },
      ]);

      // Both screens share Navigation Bar components
      const exitButton = shared.find(c => c.definitionId === '2708:1961');
      expect(exitButton).toBeDefined();
      expect(exitButton?.name).toBe('exit button');

      const backButton = shared.find(c => c.definitionId === '2708:1962');
      expect(backButton).toBeDefined();
      expect(backButton?.name).toBe('back button');

      // Both screens share footer components
      const footer = shared.find(c => c.definitionId === '2603:5165');
      expect(footer).toBeDefined();
      expect(footer?.name).toBe('footer');

      const watermark = shared.find(c => c.definitionId === '2603:5166');
      expect(watermark).toBeDefined();
      expect(watermark?.name).toBe('watermark');

      // Both share icon padding wrapper
      const padding = shared.find(c => c.definitionId === '2026:14620');
      expect(padding).toBeDefined();
      expect(padding?.name).toBe('padding');

      // Both share icon container
      const iconContainer = shared.find(c => c.definitionId === '632:805');
      expect(iconContainer).toBeDefined();
      expect(iconContainer?.name).toBe('icon');
    });

    it('should correctly count instances per shared component', async () => {
      const screen1Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2416.txt'),
        'utf-8'
      );
      const screen2Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2571.txt'),
        'utf-8'
      );

      const shared = findSharedComponents([
        { screenNodeId: '237:2416', content: screen1Content },
        { screenNodeId: '237:2571', content: screen2Content },
      ]);

      // 2026:14620 (padding) appears 2x per screen (exit + back buttons)
      const padding = shared.find(c => c.definitionId === '2026:14620');
      expect(padding).toBeDefined();
      // 2 instances in screen 1 + 2 instances in screen 2 = 4 total
      expect(padding?.instances.length).toBe(4);

      // Exit button appears 1x per screen
      const exitButton = shared.find(c => c.definitionId === '2708:1961');
      expect(exitButton?.instances.length).toBe(2);
    });

    it('should produce a dimensions map that covers all instances', async () => {
      const screen1Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2416.txt'),
        'utf-8'
      );
      const screen2Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2571.txt'),
        'utf-8'
      );

      const shared = findSharedComponents([
        { screenNodeId: '237:2416', content: screen1Content },
        { screenNodeId: '237:2571', content: screen2Content },
      ]);

      // Simulate setting dimensions for exit button (48x48)
      const exitButton = shared.find(c => c.definitionId === '2708:1961')!;
      const dimensions: Record<string, { w: number; h: number }> = {};

      for (const instance of exitButton.instances) {
        dimensions[instance.instanceId] = { w: 48, h: 48 };
      }

      // Should have dimensions for both screen instances
      expect(dimensions['I237:2417;2708:1961']).toEqual({ w: 48, h: 48 });
      expect(dimensions['I237:2572;2708:1961']).toEqual({ w: 48, h: 48 });
    });
  });

  describe('Shared Component Dimension Application', () => {
    it('should apply same dimensions to all instances of a shared component', async () => {
      // This test validates the workflow:
      // 1. Find shared component
      // 2. Ask user once for dimensions
      // 3. Apply to all instances

      const screen1Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2416.txt'),
        'utf-8'
      );
      const screen2Content = await fs.readFile(
        path.join(FIXTURES_DIR, 'figma-237-2571.txt'),
        'utf-8'
      );

      const shared = findSharedComponents([
        { screenNodeId: '237:2416', content: screen1Content },
        { screenNodeId: '237:2571', content: screen2Content },
      ]);

      // Build a combined dimensions JSON for both screens
      const sharedDimensions: Record<string, { w: number; h: number; shared?: boolean }> = {};

      // Footer component: 393x32
      const footer = shared.find(c => c.definitionId === '2603:5165')!;
      for (const instance of footer.instances) {
        sharedDimensions[instance.instanceId] = { w: 393, h: 32, shared: true };
      }

      // Exit button padding: 48x48
      const exitPadding = shared.find(c => c.definitionId === '2026:14620')!;
      for (const instance of exitPadding.instances) {
        sharedDimensions[instance.instanceId] = { w: 48, h: 48, shared: true };
      }

      // Verify all instances got dimensions
      expect(Object.keys(sharedDimensions).length).toBeGreaterThan(0);

      // All footer instances should have same dimensions
      const footerDims = footer.instances.map(i => sharedDimensions[i.instanceId]);
      expect(footerDims.every(d => d.w === 393 && d.h === 32)).toBe(true);

      // All padding instances should have same dimensions
      const paddingDims = exitPadding.instances.map(i => sharedDimensions[i.instanceId]);
      expect(paddingDims.every(d => d.w === 48 && d.h === 48)).toBe(true);
    });
  });
});

import { execSync } from 'child_process';

const SKILL_DIR = path.resolve(__dirname, '../../skills/figma-to-react');
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');

describe('Shared + Validate Integration', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  it('validate-dimensions-coverage.sh should skip shared components with dimensions', async () => {
    // Integration test workflow:
    // 1. Run find-shared-components.ts to identify shared components
    // 2. Add dimensions for those shared components
    // 3. Run validate-dimensions-coverage.sh
    // 4. Verify it doesn't report the shared components as missing

    // Copy fixture captures to tmp
    const capture1Path = path.join(TMP_DIR, 'figma-237-2416.txt');
    const capture2Path = path.join(TMP_DIR, 'figma-237-2571.txt');
    await fs.copy(path.join(FIXTURES_DIR, 'figma-237-2416.txt'), capture1Path);
    await fs.copy(path.join(FIXTURES_DIR, 'figma-237-2571.txt'), capture2Path);

    // Step 1: Run find-shared-components.ts
    const findSharedScript = path.join(SCRIPTS_DIR, 'find-shared-components.ts');
    const sharedResult = execSync(
      `bun "${findSharedScript}" "${capture1Path}" "${capture2Path}"`,
      { encoding: 'utf-8' }
    );
    const sharedData = JSON.parse(sharedResult);

    expect(sharedData.total_shared).toBeGreaterThan(0);

    // Step 2: Create a mock TSX file with collapse-prone elements that are shared
    // Note: data-node-id and className must be on same line for collapse detection
    const mockTsx = `
<div data-node-id="I237:2417;2708:1961" data-name="exit button" className="relative p-[12px]"><Icon /></div>
<div data-node-id="I237:2572;2708:1961" data-name="exit button" className="relative p-[12px]"><Icon /></div>
<div data-node-id="I237:9999;unique:component" data-name="unique element" className="relative p-[8px]"><Text /></div>
`;
    const tsxPath = path.join(TMP_DIR, 'TestComponent.tsx');
    await fs.writeFile(tsxPath, mockTsx);

    // Step 3: Create dimensions JSON with shared component dimensions
    // We add dimensions for the exit button (shared) but NOT for the unique element
    const dimensions: Record<string, { w: number; h: number }> = {
      // Dimensions for exit button instances (shared)
      'I237:2417;2708:1961': { w: 48, h: 48 },
      'I237:2572;2708:1961': { w: 48, h: 48 },
      // NO dimensions for the unique element
    };
    const dimensionsPath = path.join(TMP_DIR, 'dimensions.json');
    await fs.writeJson(dimensionsPath, dimensions);

    // Step 4: Run validate-dimensions-coverage.sh
    const validateScript = path.join(SCRIPTS_DIR, 'validate-dimensions-coverage.sh');
    let validateResult: string;

    try {
      validateResult = execSync(
        `bash "${validateScript}" "${tsxPath}" "${dimensionsPath}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (error: any) {
      // Script exits with 1 when there are missing dimensions
      validateResult = error.stdout || '';
    }

    // Parse the JSON output
    const validateData = JSON.parse(validateResult);

    // Should report the unique element as missing (critical)
    expect(validateData.critical_missing).toBe(1);

    // Should NOT include the shared exit button instances in missing
    const missingIds = validateData.missing?.map((m: { id: string }) => m.id) || [];
    expect(missingIds).not.toContain('I237:2417;2708:1961');
    expect(missingIds).not.toContain('I237:2572;2708:1961');

    // Should include the unique element in missing
    expect(missingIds).toContain('I237:9999;unique:component');
  });

  it('find-shared-components.ts should output valid JSON with screen information', async () => {
    // Copy fixture captures to tmp
    const capture1Path = path.join(TMP_DIR, 'figma-237-2416.txt');
    const capture2Path = path.join(TMP_DIR, 'figma-237-2571.txt');
    await fs.copy(path.join(FIXTURES_DIR, 'figma-237-2416.txt'), capture1Path);
    await fs.copy(path.join(FIXTURES_DIR, 'figma-237-2571.txt'), capture2Path);

    const findSharedScript = path.join(SCRIPTS_DIR, 'find-shared-components.ts');
    const result = execSync(
      `bun "${findSharedScript}" "${capture1Path}" "${capture2Path}"`,
      { encoding: 'utf-8' }
    );

    const data = JSON.parse(result);

    // Should have shared array
    expect(Array.isArray(data.shared)).toBe(true);
    expect(data.total_shared).toBe(data.shared.length);

    // Each shared component should have screen information
    for (const component of data.shared) {
      expect(component.definitionId).toBeTruthy();
      expect(Array.isArray(component.instances)).toBe(true);

      for (const instance of component.instances) {
        expect(instance.instanceId).toBeTruthy();
        expect(instance.screen).toBeTruthy();
        // Screen should be extracted from filename (237:2416 or 237:2571)
        expect(instance.screen).toMatch(/^\d+:\d+$/);
      }
    }
  });

  it('should handle single-screen gracefully (no shared components)', async () => {
    const capture1Path = path.join(TMP_DIR, 'figma-237-2416.txt');
    await fs.copy(path.join(FIXTURES_DIR, 'figma-237-2416.txt'), capture1Path);

    const findSharedScript = path.join(SCRIPTS_DIR, 'find-shared-components.ts');

    // Script requires 2+ captures - should error
    try {
      execSync(`bun "${findSharedScript}" "${capture1Path}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect.fail('Should have thrown error for single file');
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('at least 2');
    }
  });
});
