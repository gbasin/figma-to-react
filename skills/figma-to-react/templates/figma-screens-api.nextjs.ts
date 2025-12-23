import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Read componentDir from config if available
    const configPath = '/tmp/figma-to-react/config.json';
    let componentDir = 'src/components/figma';

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      componentDir = config.componentDir || componentDir;
    } catch {
      // Use default if config not found
    }

    const dir = join(process.cwd(), componentDir);
    const files = readdirSync(dir).filter(f => f.endsWith('.tsx'));
    const screens = files.map(f => f.replace('.tsx', ''));
    return NextResponse.json({ screens });
  } catch {
    return NextResponse.json({ screens: [] });
  }
}
