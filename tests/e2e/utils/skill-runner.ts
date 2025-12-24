import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

export interface SkillRunResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number | null;
}

export interface FigmaTestConfig {
  figmaUrl: string;
  componentName?: string;
  nodeId: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, '../../../');

/**
 * Runs the figma-to-react skill via the Claude CLI
 */
export async function runFigmaToReactSkill(
  testProjectPath: string,
  config: FigmaTestConfig,
  timeoutMs: number = 300000
): Promise<SkillRunResult> {
  const prompt = buildSkillPrompt(config);

  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    let timedOut = false;

    // Spawn claude CLI with the skill invocation
    const proc = spawn('claude', ['-p', prompt, '--allowedTools', 'Skill,Read,Write,Edit,Bash,Glob,Grep,Task,WebFetch,TodoWrite'], {
      cwd: testProjectPath,
      env: {
        ...process.env,
        // Ensure the plugin is loaded
        CLAUDE_PLUGINS: PLUGIN_ROOT,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (timedOut) {
        resolve({
          success: false,
          output,
          error: `Skill execution timed out after ${timeoutMs}ms`,
          exitCode: null,
        });
        return;
      }

      resolve({
        success: exitCode === 0,
        output,
        error: errorOutput || undefined,
        exitCode,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        output,
        error: err.message,
        exitCode: null,
      });
    });
  });
}

function buildSkillPrompt(config: FigmaTestConfig): string {
  return `Use the figma-to-react skill to convert this Figma design to a React component.

Figma URL: ${config.figmaUrl}

When asked to confirm configuration, accept the defaults. Do not ask any questions - just proceed with the conversion.`;
}

/**
 * Parses the node ID from a Figma URL
 */
export function parseNodeIdFromUrl(figmaUrl: string): string {
  const match = figmaUrl.match(/node-id=([^&]+)/);
  if (!match) {
    throw new Error(`Could not parse node-id from URL: ${figmaUrl}`);
  }
  return match[1];
}

/**
 * Extracts the file key from a Figma URL
 */
export function parseFileKeyFromUrl(figmaUrl: string): string {
  const match = figmaUrl.match(/figma\.com\/design\/([^/]+)/);
  if (!match) {
    throw new Error(`Could not parse file key from URL: ${figmaUrl}`);
  }
  return match[1];
}
