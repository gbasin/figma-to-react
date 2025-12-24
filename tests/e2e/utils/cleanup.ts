import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react');
const BACKUP_DIR = path.join(os.tmpdir(), 'figma-to-react-test-backup');

/**
 * Gets the temp directory path
 */
export function getTmpDir(): string {
  return TMP_DIR;
}

/**
 * Backs up the existing figma-to-react temp directory
 */
export async function backupTmpDir(): Promise<void> {
  if (await fs.pathExists(TMP_DIR)) {
    await fs.move(TMP_DIR, BACKUP_DIR, { overwrite: true });
  }
}

/**
 * Restores the backed up figma-to-react temp directory
 */
export async function restoreTmpDir(): Promise<void> {
  if (await fs.pathExists(BACKUP_DIR)) {
    await fs.remove(TMP_DIR);
    await fs.move(BACKUP_DIR, TMP_DIR);
  }
}

/**
 * Cleans the figma-to-react temp directory
 */
export async function cleanTmpDir(): Promise<void> {
  await fs.remove(TMP_DIR);
}

/**
 * Resets the test project to its clean state
 */
export async function resetTestProject(testProjectPath: string): Promise<void> {
  // Remove generated directories (but preserve test fixtures)
  const dirsToRemove = [
    'src/styles',
    'src/pages',
    'public/figma-assets',
  ];

  for (const dir of dirsToRemove) {
    const fullPath = path.join(testProjectPath, dir);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }

  // Ensure components directory exists for test fixtures
  const componentsDir = path.join(testProjectPath, 'src/components');
  await fs.ensureDir(componentsDir);

  // Create test fixture component with size-full on root
  const testComponentPath = path.join(componentsDir, 'SizeFullTestComponent.tsx');
  const testComponentContent = `/**
 * Test fixture component that mimics MCP-generated output with size-full on root.
 * Used to verify that the preview wrapper correctly constrains the component.
 *
 * Expected behavior:
 * - Component has size-full (100% width/height) on root
 * - Preview wrapper should constrain it to exact Figma dimensions
 * - Screenshot should match wrapper dimensions exactly
 */
export function SizeFullTestComponent() {
  return (
    <div
      className="size-full bg-blue-500 flex items-center justify-center"
      data-testid="size-full-root"
    >
      <div className="text-white text-2xl font-bold">
        Test Component
      </div>
      {/* Add some content that would overflow if not clipped */}
      <div className="absolute -bottom-10 left-0 right-0 h-20 bg-red-500">
        This should be clipped by overflow:hidden
      </div>
    </div>
  );
}

export default SizeFullTestComponent;
`;
  await fs.writeFile(testComponentPath, testComponentContent);

  // Reset index.css to template
  const templatePath = path.join(testProjectPath, 'src/index.css.template');
  const cssPath = path.join(testProjectPath, 'src/index.css');

  if (await fs.pathExists(templatePath)) {
    await fs.copy(templatePath, cssPath, { overwrite: true });
  }

  // Reset App.tsx with proper preview wrapper implementation
  const appPath = path.join(testProjectPath, 'src/App.tsx');
  const appContent = `import { useSearchParams } from 'react-router-dom';
import { SizeFullTestComponent } from './components/SizeFullTestComponent';

// Component registry - maps screen names to components
const components: Record<string, React.ComponentType> = {
  SizeFullTestComponent,
};

// Dimensions registry - maps screen names to Figma frame dimensions
const dimensions: Record<string, { width: number; height: number }> = {
  SizeFullTestComponent: { width: 393, height: 852 }, // Match fixture dimensions
};

function App() {
  const [searchParams] = useSearchParams();
  const screen = searchParams.get('screen');

  if (screen) {
    const Component = components[screen];
    const dim = dimensions[screen];

    if (!Component) {
      return (
        <div data-figma-component={screen}>
          <p>Component "{screen}" not found. Run the figma-to-react skill first.</p>
        </div>
      );
    }

    // Render with proper wrapper: explicit dimensions + overflow hidden
    return (
      <div
        data-figma-component={screen}
        style={{
          width: dim?.width,
          height: dim?.height,
          overflow: 'hidden',
          position: 'relative', // For absolute positioned children
        }}
      >
        <Component />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Figma to React Test Project</h1>
      <p className="mt-4 text-gray-600">
        This project is used for E2E testing of the figma-to-react skill.
      </p>
    </div>
  );
}

export default App;
`;
  await fs.writeFile(appPath, appContent);
}

/**
 * Kills any lingering dev server processes
 */
export async function killDevServers(): Promise<void> {
  try {
    execSync('pkill -f "vite.*test-project"', { stdio: 'ignore' });
  } catch {
    // Ignore errors - no processes to kill
  }
}

/**
 * Installs dependencies for the test project if needed
 */
export async function installTestProjectDeps(testProjectPath: string): Promise<void> {
  const nodeModulesPath = path.join(testProjectPath, 'node_modules');

  if (!(await fs.pathExists(nodeModulesPath))) {
    console.log('Installing test project dependencies...');
    execSync('pnpm install', { cwd: testProjectPath, stdio: 'inherit' });
  }
}

/**
 * Installs Playwright browser if needed
 */
export async function installPlaywright(testProjectPath: string): Promise<void> {
  try {
    execSync('bunx playwright --version', { cwd: testProjectPath, stdio: 'ignore' });
  } catch {
    console.log('Installing Playwright chromium...');
    execSync('bunx playwright install chromium', { cwd: testProjectPath, stdio: 'inherit' });
  }
}

/**
 * Checks if ImageMagick is available
 */
export function isImageMagickAvailable(): boolean {
  try {
    execSync('magick --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if Playwright browsers are installed
 */
export function isPlaywrightAvailable(): boolean {
  try {
    // Check if chromium browser is available by running a quick check
    execSync('bunx playwright --version', { stdio: 'ignore' });
    // Also check if browsers are actually installed
    const result = execSync('ls ~/.cache/ms-playwright/chromium-* 2>/dev/null || echo "not found"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return !result.includes('not found');
  } catch {
    return false;
  }
}
