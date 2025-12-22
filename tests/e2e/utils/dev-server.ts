import { spawn, ChildProcess, execSync } from 'child_process';
import { createServer } from 'net';

let devServerProcess: ChildProcess | null = null;
let devServerPort: number | null = null;

/**
 * Finds an available port
 */
async function findAvailablePort(startPort: number = 5173): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', () => {
      // Port in use, try next
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

/**
 * Gets the current dev server port
 */
export function getDevServerPort(): number | null {
  return devServerPort;
}

/**
 * Starts the Vite dev server for the test project
 */
export async function startDevServer(
  projectPath: string,
  preferredPort: number = 5173,
  timeoutMs: number = 30000
): Promise<number> {
  if (devServerProcess && devServerPort) {
    console.log(`Dev server already running on port ${devServerPort}`);
    return devServerPort;
  }

  // Find available port
  const port = await findAvailablePort(preferredPort);
  devServerPort = port;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopDevServer();
      reject(new Error(`Dev server failed to start within ${timeoutMs}ms`));
    }, timeoutMs);

    devServerProcess = spawn('pnpm', ['dev', '--port', String(port)], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin to prevent hangs
    });

    // Use HTTP polling instead of string matching for reliability
    const checkServer = async () => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const response = await fetch(`http://localhost:${port}`);
          if (response.ok || response.status === 404) {
            // Server is responding
            clearTimeout(timeout);
            resolve(port);
            return;
          }
        } catch {
          // Not ready yet
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    };

    checkServer();

    devServerProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      // Only log actual errors, not warnings
      if (msg.includes('error') || msg.includes('Error')) {
        console.error('Dev server stderr:', msg);
      }
    });

    devServerProcess.on('error', (err) => {
      clearTimeout(timeout);
      devServerProcess = null;
      devServerPort = null;
      reject(err);
    });

    devServerProcess.on('close', (code) => {
      if (code !== 0 && code !== null && devServerProcess) {
        clearTimeout(timeout);
        devServerProcess = null;
        devServerPort = null;
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

/**
 * Stops the dev server with proper cleanup
 */
export async function stopDevServer(): Promise<void> {
  if (!devServerProcess) {
    devServerPort = null;
    return;
  }

  const proc = devServerProcess;
  const pid = proc.pid;
  devServerProcess = null;
  devServerPort = null;

  if (!pid) {
    return;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // Listen for exit
    proc.on('exit', cleanup);
    proc.on('close', cleanup);

    // Try graceful shutdown first
    try {
      proc.kill('SIGTERM');
    } catch {
      // Process might already be dead
      cleanup();
      return;
    }

    // Force kill after 2 seconds if still running
    setTimeout(() => {
      try {
        // Check if process is still running
        process.kill(pid, 0);
        // Still running, force kill
        proc.kill('SIGKILL');
      } catch {
        // Process is dead
      }
      // Give it a moment then resolve regardless
      setTimeout(cleanup, 200);
    }, 2000);
  });
}

/**
 * Waits for a URL to become available
 */
export async function waitForServer(
  url: string,
  timeoutMs: number = 30000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet, retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error(`Server at ${url} not ready after ${timeoutMs}ms`);
}

/**
 * Kill any processes using a specific port (cleanup helper)
 */
export function killProcessOnPort(port: number): void {
  try {
    // macOS/Linux
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
    });
  } catch {
    // Ignore errors
  }
}
