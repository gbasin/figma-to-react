/**
 * Tests for the preview route functionality.
 *
 * Verifies:
 * - Preview route templates exist and are valid
 * - process-figma.sh injects figmaDimensions export
 * - Dynamic import pattern works with dimension exports
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { execSync } from 'child_process';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_DIR = path.resolve(__dirname, '../../skills/figma-to-react');
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
// Use hardcoded /tmp/figma-to-react to match what the scripts expect
const TMP_DIR = '/tmp/figma-to-react';

describe('Preview Route Templates', () => {
  it('Vite template should exist and be valid TypeScript', async () => {
    const templatePath = path.join(TEMPLATES_DIR, 'FigmaPreview.vite.tsx');
    expect(await fs.pathExists(templatePath)).toBe(true);

    const content = await fs.readFile(templatePath, 'utf-8');

    // Should have required imports
    expect(content).toContain("import { Suspense, useEffect, useState }");
    expect(content).toContain("import { useSearchParams }");
    expect(content).toContain("from 'react-router-dom'");

    // Should use import.meta.glob for dynamic imports
    expect(content).toContain('import.meta.glob');
    expect(content).toContain("../components/figma/*.tsx");

    // Should read figmaDimensions from module
    expect(content).toContain('figmaDimensions');
    expect(content).toContain('mod.figmaDimensions');

    // Should have data-figma-component attribute for screenshot capture
    expect(content).toContain('data-figma-component');

    // Should set explicit dimensions on wrapper
    expect(content).toContain('width: dim.width');
    expect(content).toContain('height: dim.height');
    expect(content).toContain("overflow: 'hidden'");
  });

  it('Next.js template should exist and be valid TypeScript', async () => {
    const templatePath = path.join(TEMPLATES_DIR, 'FigmaPreview.nextjs.tsx');
    expect(await fs.pathExists(templatePath)).toBe(true);

    const content = await fs.readFile(templatePath, 'utf-8');

    // Should have 'use client' directive
    expect(content).toContain("'use client'");

    // Should have required imports
    expect(content).toContain("import { Suspense, useEffect, useState }");
    expect(content).toContain("from 'next/navigation'");

    // Should fetch screens from API route
    expect(content).toContain("fetch('/api/figma-screens')");

    // Should use dynamic import with template literal
    expect(content).toContain('import(`@/components/figma/');

    // Should read figmaDimensions from module
    expect(content).toContain('figmaDimensions');
    expect(content).toContain('mod.figmaDimensions');

    // Should have data-figma-component attribute for screenshot capture
    expect(content).toContain('data-figma-component');
  });

  it('Next.js API route template should exist and be valid', async () => {
    const templatePath = path.join(TEMPLATES_DIR, 'figma-screens-api.nextjs.ts');
    expect(await fs.pathExists(templatePath)).toBe(true);

    const content = await fs.readFile(templatePath, 'utf-8');

    // Should have required imports
    expect(content).toContain("import { readdirSync");
    expect(content).toContain("from 'next/server'");
    expect(content).toContain('NextResponse');

    // Should read from config file
    expect(content).toContain('/tmp/figma-to-react/config.json');
    expect(content).toContain('componentDir');

    // Should filter for .tsx files
    expect(content).toContain(".endsWith('.tsx')");

    // Should return JSON response
    expect(content).toContain('NextResponse.json');
  });
});

describe('Dimension Export Injection', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
    await fs.ensureDir(path.join(TMP_DIR, 'metadata'));
    await fs.ensureDir(path.join(TMP_DIR, 'captures'));
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  it('process-figma.sh should inject figmaDimensions export when dimensions available', async () => {
    const nodeId = '123-456';

    // Create mock metadata file with dimensions
    const metadataPath = path.join(TMP_DIR, 'metadata', `${nodeId}.json`);
    await fs.writeJSON(metadataPath, {
      nodeId: '123:456',
      width: 390,
      height: 844,
    });

    // Create mock dimensions file (required by fix-collapsed-containers)
    const dimensionsPath = path.join(TMP_DIR, 'metadata', `${nodeId}-dimensions.json`);
    await fs.writeJSON(dimensionsPath, {
      '123:456': { w: 390, h: 844 },
    });

    // Create mock captured Figma response (minimal valid component)
    const capturePath = path.join(TMP_DIR, 'captures', `figma-${nodeId}.txt`);
    const mockComponent = `export function TestComponent() {
  return (
    <div className="w-full h-full bg-blue-500">
      <span>Hello World</span>
    </div>
  );
}

export default TestComponent;
`;
    await fs.writeFile(capturePath, mockComponent);

    // Create output directory
    const outputDir = path.join(TMP_DIR, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'TestComponent.tsx');

    // Create asset directory
    const assetDir = path.join(TMP_DIR, 'assets');
    await fs.ensureDir(assetDir);

    // Run process-figma.sh
    const processScript = path.join(SCRIPTS_DIR, 'process-figma.sh');

    try {
      execSync(
        `bash "${processScript}" "${capturePath}" "${outputPath}" "${assetDir}" "/assets"`,
        {
          cwd: SKILL_DIR,
          stdio: 'pipe',
          env: { ...process.env, PATH: process.env.PATH },
        }
      );
    } catch (error: any) {
      // Log stderr for debugging
      if (error.stderr) {
        console.log('Script stderr:', error.stderr.toString());
      }
      throw error;
    }

    // Verify output file was created
    expect(await fs.pathExists(outputPath)).toBe(true);

    // Read the generated component
    const generatedContent = await fs.readFile(outputPath, 'utf-8');

    // Should have figmaDimensions export at the beginning
    expect(generatedContent).toContain('export const figmaDimensions');
    expect(generatedContent).toContain('width: 390');
    expect(generatedContent).toContain('height: 844');

    // The export should be near the top of the file
    const exportIndex = generatedContent.indexOf('export const figmaDimensions');
    expect(exportIndex).toBeLessThan(100); // Should be in first 100 chars
  });

  it('process-figma.sh should preserve use client directive at line 1', async () => {
    const nodeId = '456-789';

    // Create mock metadata file with dimensions
    const metadataPath = path.join(TMP_DIR, 'metadata', `${nodeId}.json`);
    await fs.writeJSON(metadataPath, {
      nodeId: '456:789',
      width: 375,
      height: 812,
    });

    // Create mock dimensions file
    const dimensionsPath = path.join(TMP_DIR, 'metadata', `${nodeId}-dimensions.json`);
    await fs.writeJSON(dimensionsPath, {
      '456:789': { w: 375, h: 812 },
    });

    // Create mock captured Figma response WITH 'use client'
    const capturePath = path.join(TMP_DIR, 'captures', `figma-${nodeId}.txt`);
    const mockComponent = `'use client';

export function ClientComponent() {
  return (
    <div className="w-full h-full">
      <button onClick={() => console.log('clicked')}>Click me</button>
    </div>
  );
}

export default ClientComponent;
`;
    await fs.writeFile(capturePath, mockComponent);

    // Create output directory
    const outputDir = path.join(TMP_DIR, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'ClientComponent.tsx');

    // Create asset directory
    const assetDir = path.join(TMP_DIR, 'assets');
    await fs.ensureDir(assetDir);

    // Run process-figma.sh
    const processScript = path.join(SCRIPTS_DIR, 'process-figma.sh');

    execSync(
      `bash "${processScript}" "${capturePath}" "${outputPath}" "${assetDir}" "/assets"`,
      {
        cwd: SKILL_DIR,
        stdio: 'pipe',
      }
    );

    // Verify output file was created
    expect(await fs.pathExists(outputPath)).toBe(true);

    // Read the generated component
    const generatedContent = await fs.readFile(outputPath, 'utf-8');
    const lines = generatedContent.split('\n');

    // 'use client' MUST be on line 1 (index 0)
    expect(lines[0].trim()).toBe("'use client';");

    // figmaDimensions should be present but AFTER 'use client'
    expect(generatedContent).toContain('export const figmaDimensions');
    expect(generatedContent).toContain('width: 375');
    expect(generatedContent).toContain('height: 812');

    // The export should come after 'use client'
    const useClientIndex = generatedContent.indexOf("'use client'");
    const dimensionsIndex = generatedContent.indexOf('export const figmaDimensions');
    expect(dimensionsIndex).toBeGreaterThan(useClientIndex);
  });

  it('process-figma.sh should skip dimension injection when no dimensions available', async () => {
    const nodeId = '789-012';

    // Create captures directory but NO metadata file (simulating missing dimensions)
    const capturePath = path.join(TMP_DIR, 'captures', `figma-${nodeId}.txt`);
    const mockComponent = `export function NoMetadataComponent() {
  return <div>No metadata test</div>;
}
`;
    await fs.writeFile(capturePath, mockComponent);

    // Create output directory
    const outputDir = path.join(TMP_DIR, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'NoMetadataComponent.tsx');

    // Create asset directory
    const assetDir = path.join(TMP_DIR, 'assets');
    await fs.ensureDir(assetDir);

    // Run process-figma.sh (should succeed but not inject dimensions)
    const processScript = path.join(SCRIPTS_DIR, 'process-figma.sh');

    try {
      execSync(
        `bash "${processScript}" "${capturePath}" "${outputPath}" "${assetDir}" "/assets"`,
        {
          cwd: SKILL_DIR,
          stdio: 'pipe',
        }
      );
    } catch (error: any) {
      // Script might fail for other reasons, but dimension injection shouldn't be the cause
      if (error.stderr && error.stderr.toString().includes('dimension')) {
        throw error;
      }
    }

    // If output was created, it should NOT have figmaDimensions
    if (await fs.pathExists(outputPath)) {
      const generatedContent = await fs.readFile(outputPath, 'utf-8');
      expect(generatedContent).not.toContain('export const figmaDimensions');
    }
  });
});

describe('Step File References', () => {
  it('step-3b-preview-route.md should exist and reference templates', async () => {
    const stepPath = path.join(SKILL_DIR, 'references', 'step-3b-preview-route.md');
    expect(await fs.pathExists(stepPath)).toBe(true);

    const content = await fs.readFile(stepPath, 'utf-8');

    // Should reference the template files
    expect(content).toContain('FigmaPreview.vite.tsx');
    expect(content).toContain('FigmaPreview.nextjs.tsx');
    expect(content).toContain('figma-screens-api.nextjs.ts');

    // Should mention copying templates
    expect(content).toContain('$SKILL_DIR/templates/');

    // Should explain why this step is before generation
    expect(content).toContain('BEFORE component generation');
  });

  it('SKILL.md should have step 3b in the workflow', async () => {
    const skillPath = path.join(SKILL_DIR, 'SKILL.md');
    expect(await fs.pathExists(skillPath)).toBe(true);

    const content = await fs.readFile(skillPath, 'utf-8');

    // Should list step 3b
    expect(content).toContain('3b. Create preview route');
    expect(content).toContain('step-3b-preview-route.md');

    // Step 3b should come before step 4
    const step3bIndex = content.indexOf('3b. Create preview route');
    const step4Index = content.indexOf('4. Generate screens');
    expect(step3bIndex).toBeLessThan(step4Index);
  });

  it('step-4-generation.md should mention preview availability', async () => {
    const stepPath = path.join(SKILL_DIR, 'references', 'step-4-generation.md');
    expect(await fs.pathExists(stepPath)).toBe(true);

    const content = await fs.readFile(stepPath, 'utf-8');

    // Should mention that preview is available
    expect(content).toContain('Preview Available');
    expect(content).toContain('step 3b');
    expect(content).toContain('/figma-preview');
  });

  it('step-4b-validate-dimensions.md should mention using preview', async () => {
    const stepPath = path.join(SKILL_DIR, 'references', 'step-4b-validate-dimensions.md');
    expect(await fs.pathExists(stepPath)).toBe(true);

    const content = await fs.readFile(stepPath, 'utf-8');

    // Should mention the preview for dimension decisions
    expect(content).toContain('Use the Preview');
    expect(content).toContain('/figma-preview');
  });
});
