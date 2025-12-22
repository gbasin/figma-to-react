import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  backupTmpDir,
  restoreTmpDir,
  cleanTmpDir,
  resetTestProject,
  killDevServers,
  installTestProjectDeps,
  installPlaywright,
} from './utils/cleanup';
import { stopDevServer } from './utils/dev-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_PROJECT_DIR = path.resolve(__dirname, 'fixtures/test-project');

beforeAll(async () => {
  console.log('Setting up E2E test environment...');

  // Backup existing /tmp/figma-to-react
  await backupTmpDir();

  // Install test project dependencies
  await installTestProjectDeps(TEST_PROJECT_DIR);

  // Install Playwright if needed
  await installPlaywright(TEST_PROJECT_DIR);

  console.log('E2E test environment ready');
});

afterAll(async () => {
  console.log('Cleaning up E2E test environment...');

  // Stop any dev servers
  await stopDevServer();

  // Restore backed up directory
  await restoreTmpDir();

  console.log('E2E test environment cleaned up');
});

beforeEach(async () => {
  // Clean temp directory before each test
  await cleanTmpDir();

  // Reset test project to clean state
  await resetTestProject(TEST_PROJECT_DIR);
});

afterEach(async () => {
  // Kill any lingering dev servers
  await killDevServers();
});
