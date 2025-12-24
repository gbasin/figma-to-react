#!/usr/bin/env bun
/**
 * Find shared components across multiple Figma screen captures.
 *
 * Usage:
 *   bun find-shared-components.ts capture1.txt capture2.txt [capture3.txt ...]
 *
 * Output (JSON):
 *   {
 *     "shared": [
 *       {
 *         "definitionId": "2708:1961",
 *         "name": "exit button",
 *         "instances": [
 *           {"instanceId": "I237:2417;2708:1961", "screen": "237:2416"},
 *           {"instanceId": "I237:2572;2708:1961", "screen": "237:2571"}
 *         ]
 *       }
 *     ],
 *     "total_shared": 6
 *   }
 */

import fs from 'fs';
import path from 'path';

interface Instance {
  instanceId: string;
  screen: string;
}

interface SharedComponent {
  definitionId: string;
  name: string | null;
  instances: Instance[];
}

interface Output {
  shared: SharedComponent[];
  total_shared: number;
}

/**
 * Extract the component definition ID from an instance node ID.
 * Instance IDs follow: I{parent};{component}[;{nested}...]
 * Returns the last segment (the innermost component definition).
 */
function extractComponentDefinitionId(instanceId: string): string | null {
  if (!instanceId.startsWith('I')) {
    return null;
  }
  const parts = instanceId.split(';');
  if (parts.length < 2) {
    return null;
  }
  return parts[parts.length - 1];
}

/**
 * Extract all node IDs from capture content.
 */
function extractNodeIds(content: string): string[] {
  const pattern = /data-node-id="([^"]+)"/g;
  const matches = content.matchAll(pattern);
  return [...matches].map(m => m[1]);
}

/**
 * Extract the screen's root node ID from the capture.
 * Looks for the first data-node-id that's not an instance (doesn't start with I).
 */
function extractScreenNodeId(content: string): string {
  const nodeIds = extractNodeIds(content);
  for (const id of nodeIds) {
    if (!id.startsWith('I')) {
      return id;
    }
  }
  // Fallback: use filename pattern
  return 'unknown';
}

/**
 * Extract element name from data-name attribute for a given node ID.
 */
function extractElementName(content: string, nodeId: string): string | null {
  const escapedId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Try both orderings of data-name and data-node-id
  const pattern = new RegExp(
    `data-name="([^"]+)"[^>]*data-node-id="${escapedId}"|data-node-id="${escapedId}"[^>]*data-name="([^"]+)"`
  );
  const match = content.match(pattern);
  return match ? (match[1] || match[2]) : null;
}

/**
 * Find shared components across multiple captures.
 */
function findSharedComponents(
  captures: Array<{ screen: string; content: string }>
): SharedComponent[] {
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

      // Avoid duplicates
      const exists = component.instances.some(
        i => i.instanceId === nodeId && i.screen === capture.screen
      );

      if (!exists) {
        component.instances.push({
          instanceId: nodeId,
          screen: capture.screen,
        });
      }
    }
  }

  // Filter to components appearing in 2+ different screens
  return [...componentMap.values()].filter(c => {
    const uniqueScreens = new Set(c.instances.map(i => i.screen));
    return uniqueScreens.size > 1;
  });
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: bun find-shared-components.ts capture1.txt capture2.txt [...]');
    console.error('Need at least 2 capture files to find shared components.');
    process.exit(1);
  }

  const captures: Array<{ screen: string; content: string }> = [];

  for (const filePath of args) {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const screen = extractScreenNodeId(content);

    // Also try to extract from filename (figma-237-2571.txt → 237:2571)
    const filenameMatch = path.basename(filePath).match(/figma-(\d+)-(\d+)/);
    const screenFromFilename = filenameMatch ? `${filenameMatch[1]}:${filenameMatch[2]}` : screen;

    captures.push({
      screen: screenFromFilename,
      content,
    });
  }

  const shared = findSharedComponents(captures);

  const output: Output = {
    shared,
    total_shared: shared.length,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
