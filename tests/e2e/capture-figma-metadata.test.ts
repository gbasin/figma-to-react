import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/capture-figma-metadata.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-metadata-tests');
const METADATA_DIR = '/tmp/figma-to-react/metadata';

describe('capture-figma-metadata.sh - Metadata Extraction', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
    await fs.ensureDir(METADATA_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
    // Clean up specific test files from metadata dir
    const testFiles = await fs.readdir(METADATA_DIR);
    for (const file of testFiles) {
      if (file.startsWith('test-')) {
        await fs.remove(path.join(METADATA_DIR, file));
      }
    }
  });

  const runCapture = async (nodeId: string, xml: string): Promise<void> => {
    const input = JSON.stringify({
      tool_input: { nodeId },
      tool_response: xml,
    });

    // Write input to temp file to avoid shell escaping issues
    const inputFile = path.join(TMP_DIR, 'hook-input.json');
    await fs.writeFile(inputFile, input);

    execSync(`cat "${inputFile}" | bash "${SCRIPT_PATH}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  };

  describe('Instances JSON Output', () => {
    it('should generate instances.json with parent-child structure', async () => {
      const xml = `<frame id="test-1:1" name="Root" x="0" y="0" width="393" height="852">
  <instance id="test-1:2" name="Navigation Bar" x="0" y="0" width="393" height="64" />
  <frame id="test-1:3" name="content" x="0" y="64" width="393" height="756">
    <instance id="test-1:4" name="Button" x="0" y="0" width="100" height="40" />
  </frame>
</frame>`;

      await runCapture('test-1:1', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-1-1-instances.json');
      expect(await fs.pathExists(instancesFile)).toBe(true);

      const instances = await fs.readJson(instancesFile);

      // Root should have Navigation Bar and content as children
      expect(instances['test-1:1']).toBeDefined();
      expect(instances['test-1:1']).toHaveLength(2);

      // First child should be Navigation Bar instance
      const navBar = instances['test-1:1'].find((c: any) => c.name === 'Navigation Bar');
      expect(navBar).toBeDefined();
      expect(navBar.type).toBe('instance');
      expect(navBar.h).toBe(64);

      // content frame should have Button as child
      expect(instances['test-1:3']).toBeDefined();
      const button = instances['test-1:3'].find((c: any) => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button.type).toBe('instance');
    });

    it('should capture all node types (frame, instance, text)', async () => {
      const xml = `<frame id="test-2:1" name="Root" x="0" y="0" width="400" height="300">
  <instance id="test-2:2" name="Header" x="0" y="0" width="400" height="50" />
  <frame id="test-2:3" name="Body" x="0" y="50" width="400" height="200" />
  <text id="test-2:4" name="Footer" x="0" y="250" width="400" height="50" />
</frame>`;

      await runCapture('test-2:1', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-2-1-instances.json');
      const instances = await fs.readJson(instancesFile);

      expect(instances['test-2:1']).toHaveLength(3);

      const header = instances['test-2:1'].find((c: any) => c.id === 'test-2:2');
      expect(header.type).toBe('instance');

      const body = instances['test-2:1'].find((c: any) => c.id === 'test-2:3');
      expect(body.type).toBe('frame');

      const footer = instances['test-2:1'].find((c: any) => c.id === 'test-2:4');
      expect(footer.type).toBe('text');
    });

    it('should handle deeply nested structures', async () => {
      const xml = `<frame id="test-3:1" name="Root" x="0" y="0" width="400" height="400">
  <frame id="test-3:2" name="Level1" x="0" y="0" width="400" height="200">
    <frame id="test-3:3" name="Level2" x="0" y="0" width="400" height="100">
      <instance id="test-3:4" name="DeepButton" x="0" y="0" width="100" height="40" />
    </frame>
  </frame>
</frame>`;

      await runCapture('test-3:1', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-3-1-instances.json');
      const instances = await fs.readJson(instancesFile);

      // Check the deepest level
      expect(instances['test-3:3']).toBeDefined();
      const deepButton = instances['test-3:3'].find((c: any) => c.name === 'DeepButton');
      expect(deepButton).toBeDefined();
      expect(deepButton.id).toBe('test-3:4');
    });

    it('should capture width and height for all nodes', async () => {
      const xml = `<frame id="test-4:1" name="Root" x="0" y="0" width="393" height="852">
  <instance id="test-4:2" name="Component" x="0" y="0" width="345" height="48" />
</frame>`;

      await runCapture('test-4:1', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-4-1-instances.json');
      const instances = await fs.readJson(instancesFile);

      const component = instances['test-4:1'][0];
      expect(component.w).toBe(345);
      expect(component.h).toBe(48);
    });

    it('should handle special characters in names', async () => {
      const xml = `<frame id="test-5:1" name="Root" x="0" y="0" width="400" height="300">
  <instance id="test-5:2" name="Field / Label" x="0" y="0" width="100" height="32" />
</frame>`;

      await runCapture('test-5:1', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-5-1-instances.json');
      const instances = await fs.readJson(instancesFile);

      const field = instances['test-5:1'][0];
      expect(field.name).toBe('Field / Label');
    });
  });

  describe('Dimensions JSON Output', () => {
    it('should generate dimensions.json with all node dimensions', async () => {
      const xml = `<frame id="test-6:1" name="Root" x="0" y="0" width="393" height="852">
  <instance id="test-6:2" name="Nav" x="0" y="0" width="393" height="64" />
</frame>`;

      await runCapture('test-6:1', xml);

      const dimsFile = path.join(METADATA_DIR, 'test-6-1-dimensions.json');
      expect(await fs.pathExists(dimsFile)).toBe(true);

      const dims = await fs.readJson(dimsFile);
      expect(dims['test-6:1']).toEqual({ w: 393, h: 852 });
      expect(dims['test-6:2']).toEqual({ w: 393, h: 64 });
    });
  });

  describe('Base Metadata Output', () => {
    it('should generate base metadata JSON with nodeId and dimensions', async () => {
      const xml = `<frame id="test-7:1" name="Root" x="0" y="0" width="393" height="852"></frame>`;

      await runCapture('test-7:1', xml);

      const metaFile = path.join(METADATA_DIR, 'test-7-1.json');
      expect(await fs.pathExists(metaFile)).toBe(true);

      const meta = await fs.readJson(metaFile);
      expect(meta.nodeId).toBe('test-7:1');
      expect(meta.width).toBe(393);
      expect(meta.height).toBe(852);
    });

    it('should save raw XML content', async () => {
      const xml = `<frame id="test-8:1" name="Root" x="0" y="0" width="400" height="300"></frame>`;

      await runCapture('test-8:1', xml);

      const xmlFile = path.join(METADATA_DIR, 'test-8-1.xml');
      expect(await fs.pathExists(xmlFile)).toBe(true);

      const content = await fs.readFile(xmlFile, 'utf-8');
      expect(content).toContain('test-8:1');
      expect(content).toContain('Root');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty XML gracefully', async () => {
      try {
        await runCapture('test-9:1', '');
      } catch {
        // Expected to fail, but shouldn't crash
      }
    });

    it('should handle XML with decimal dimensions', async () => {
      const xml = `<frame id="test-10:1" name="Root" x="0" y="0" width="393.5" height="852.7"></frame>`;

      await runCapture('test-10:1', xml);

      const metaFile = path.join(METADATA_DIR, 'test-10-1.json');
      const meta = await fs.readJson(metaFile);

      // Should round to integers
      expect(meta.width).toBe(394);
      expect(meta.height).toBe(853);
    });
  });

  describe('Real XML Structure', () => {
    it('should parse actual Figma MCP XML format', async () => {
      const xml = `<frame id="test-11:2038" name="Document / Small 1" x="7824" y="1518" width="393" height="852">
  <instance id="test-11:2039" name="Navigation Bar" x="0" y="0" width="393" height="64" />
  <frame id="test-11:2040" name="content" x="0" y="64" width="393" height="756">
    <frame id="test-11:2041" name="text" x="24" y="8" width="345" height="96">
      <text id="test-11:2042" name="title" x="0" y="0" width="345" height="40" />
      <text id="test-11:2043" name="body" x="0" y="48" width="345" height="48" />
    </frame>
    <frame id="test-11:2044" name="country" x="24" y="128" width="345" height="80">
      <instance id="test-11:2045" name="Field label" x="0" y="0" width="345" height="32" />
      <instance id="test-11:2046" name="Select" x="0" y="32" width="345" height="48" />
    </frame>
  </frame>
  <instance id="test-11:2050" name="Button Dock" x="0" y="820" width="393" height="32" />
</frame>`;

      await runCapture('test-11:2038', xml);

      const instancesFile = path.join(METADATA_DIR, 'test-11-2038-instances.json');
      const instances = await fs.readJson(instancesFile);

      // Check root children
      expect(instances['test-11:2038']).toHaveLength(3);

      // Check Navigation Bar
      const navBar = instances['test-11:2038'].find((c: any) => c.name === 'Navigation Bar');
      expect(navBar).toBeDefined();
      expect(navBar.h).toBe(64);

      // Check nested instances
      expect(instances['test-11:2044']).toHaveLength(2);
      const fieldLabel = instances['test-11:2044'].find((c: any) => c.name === 'Field label');
      expect(fieldLabel).toBeDefined();
      expect(fieldLabel.h).toBe(32);
    });
  });
});
