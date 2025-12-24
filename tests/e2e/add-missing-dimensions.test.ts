import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/figma-to-react/scripts/add-missing-dimensions.sh');
const TMP_DIR = path.join(os.tmpdir(), 'figma-to-react-add-dims-tests');

describe('add-missing-dimensions.sh', () => {
  beforeEach(async () => {
    await fs.ensureDir(TMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TMP_DIR);
  });

  const runScript = (args: string): { exitCode: number; stderr: string } => {
    try {
      execSync(`bash "${SCRIPT_PATH}" ${args}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: TMP_DIR,
      });
      return { exitCode: 0, stderr: '' };
    } catch (err: any) {
      return { exitCode: err.status || 1, stderr: err.stderr || '' };
    }
  };

  const createDimsFile = async (filename: string, dims: Record<string, any> = {}) => {
    const filePath = path.join(TMP_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(dims));
    return filePath;
  };

  const readDimsFile = async (filename: string) => {
    const filePath = path.join(TMP_DIR, filename);
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  };

  describe('Single ID mode (backward compat)', () => {
    it('should add dimension to single file with single ID', async () => {
      const filePath = await createDimsFile('dims.json');

      runScript(`"${filePath}" "237:2572" 393 64`);

      const result = await readDimsFile('dims.json');
      expect(result['237:2572']).toEqual({ w: 393, h: 64, manual: true });
    });

    it('should set manual: true flag', async () => {
      const filePath = await createDimsFile('dims.json');

      runScript(`"${filePath}" "1:1" 100 50`);

      const result = await readDimsFile('dims.json');
      expect(result['1:1'].manual).toBe(true);
    });

    it('should preserve existing dimensions', async () => {
      const filePath = await createDimsFile('dims.json', {
        'existing:1': { w: 200, h: 100 },
      });

      runScript(`"${filePath}" "new:1" 50 25`);

      const result = await readDimsFile('dims.json');
      expect(result['existing:1']).toEqual({ w: 200, h: 100 });
      expect(result['new:1']).toEqual({ w: 50, h: 25, manual: true });
    });

    it('should fail if file not found', async () => {
      const { exitCode } = runScript(`"${TMP_DIR}/nonexistent.json" "1:1" 100 50`);
      expect(exitCode).toBe(1);
    });

    it('should fail if width/height not numbers', async () => {
      const filePath = await createDimsFile('dims.json');
      const { exitCode } = runScript(`"${filePath}" "1:1" abc 50`);
      expect(exitCode).toBe(1);
    });
  });

  describe('Multiple IDs to single file', () => {
    it('should add multiple IDs with same dimensions', async () => {
      const filePath = await createDimsFile('dims.json');

      runScript(`"${filePath}" 393 48 "id1" "id2" "id3"`);

      const result = await readDimsFile('dims.json');
      expect(result['id1']).toEqual({ w: 393, h: 48, manual: true });
      expect(result['id2']).toEqual({ w: 393, h: 48, manual: true });
      expect(result['id3']).toEqual({ w: 393, h: 48, manual: true });
    });

    it('should handle complex instance IDs with semicolons', async () => {
      const filePath = await createDimsFile('dims.json');

      runScript(`"${filePath}" 393 48 "I2006:2073;2603:5160" "I2006:2037;2189:5226;661:724"`);

      const result = await readDimsFile('dims.json');
      expect(result['I2006:2073;2603:5160']).toEqual({ w: 393, h: 48, manual: true });
      expect(result['I2006:2037;2189:5226;661:724']).toEqual({ w: 393, h: 48, manual: true });
    });

    it('should all have manual: true flag', async () => {
      const filePath = await createDimsFile('dims.json');

      runScript(`"${filePath}" 100 50 "a" "b" "c" "d"`);

      const result = await readDimsFile('dims.json');
      expect(result['a'].manual).toBe(true);
      expect(result['b'].manual).toBe(true);
      expect(result['c'].manual).toBe(true);
      expect(result['d'].manual).toBe(true);
    });

    it('should preserve existing dimensions', async () => {
      const filePath = await createDimsFile('dims.json', {
        'existing:1': { w: 999, h: 888 },
      });

      runScript(`"${filePath}" 100 50 "new1" "new2"`);

      const result = await readDimsFile('dims.json');
      expect(result['existing:1']).toEqual({ w: 999, h: 888 });
      expect(result['new1']).toEqual({ w: 100, h: 50, manual: true });
    });
  });

  describe('Multiple files mode (--file)', () => {
    it('should add IDs to multiple files with same dimensions', async () => {
      const file1 = await createDimsFile('dims1.json');
      const file2 = await createDimsFile('dims2.json');

      runScript(`393 48 --file "${file1}" "id1" "id2" --file "${file2}" "id3"`);

      const result1 = await readDimsFile('dims1.json');
      const result2 = await readDimsFile('dims2.json');

      expect(result1['id1']).toEqual({ w: 393, h: 48, manual: true });
      expect(result1['id2']).toEqual({ w: 393, h: 48, manual: true });
      expect(result2['id3']).toEqual({ w: 393, h: 48, manual: true });
    });

    it('should handle mixed counts per file', async () => {
      const file1 = await createDimsFile('dims1.json');
      const file2 = await createDimsFile('dims2.json');
      const file3 = await createDimsFile('dims3.json');

      runScript(`100 50 --file "${file1}" "a" --file "${file2}" "b" "c" "d" --file "${file3}" "e" "f"`);

      const result1 = await readDimsFile('dims1.json');
      const result2 = await readDimsFile('dims2.json');
      const result3 = await readDimsFile('dims3.json');

      expect(Object.keys(result1)).toHaveLength(1);
      expect(Object.keys(result2)).toHaveLength(3);
      expect(Object.keys(result3)).toHaveLength(2);
    });

    it('should fail gracefully if one file missing', async () => {
      const file1 = await createDimsFile('dims1.json');

      const { exitCode } = runScript(`100 50 --file "${file1}" "id1" --file "${TMP_DIR}/nonexistent.json" "id2"`);
      expect(exitCode).toBe(1);
    });

    it('should handle complex Figma instance IDs', async () => {
      const file1 = await createDimsFile('2006-2030-dimensions.json');
      const file2 = await createDimsFile('234-2082-dimensions.json');

      runScript(`393 48 \
        --file "${file1}" "I2006:2037;2189:5232" "I2006:2037;2190:6255" "I2006:2037;2189:5226;661:724" \
        --file "${file2}" "I234:2094;2189:5232" "I234:2094;2190:6255"`);

      const result1 = await readDimsFile('2006-2030-dimensions.json');
      const result2 = await readDimsFile('234-2082-dimensions.json');

      expect(result1['I2006:2037;2189:5232']).toEqual({ w: 393, h: 48, manual: true });
      expect(result1['I2006:2037;2190:6255']).toEqual({ w: 393, h: 48, manual: true });
      expect(result1['I2006:2037;2189:5226;661:724']).toEqual({ w: 393, h: 48, manual: true });
      expect(result2['I234:2094;2189:5232']).toEqual({ w: 393, h: 48, manual: true });
      expect(result2['I234:2094;2190:6255']).toEqual({ w: 393, h: 48, manual: true });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty starting JSON', async () => {
      const filePath = await createDimsFile('dims.json', {});

      runScript(`"${filePath}" 100 50 "id1"`);

      const result = await readDimsFile('dims.json');
      expect(result['id1']).toBeDefined();
    });

    it('should overwrite existing dimension for same ID', async () => {
      const filePath = await createDimsFile('dims.json', {
        'id1': { w: 100, h: 100 },
      });

      runScript(`"${filePath}" "id1" 200 200`);

      const result = await readDimsFile('dims.json');
      expect(result['id1']).toEqual({ w: 200, h: 200, manual: true });
    });

    it('should show usage on insufficient args', async () => {
      const { exitCode } = runScript('only three args');
      expect(exitCode).toBe(1);
    });
  });
});
