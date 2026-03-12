import fs from 'node:fs/promises';
import path from 'node:path';

const fileWriteLocks = new Map();

async function queueFileWrite(filePath, writer) {
  const prev = fileWriteLocks.get(filePath) || Promise.resolve();
  const next = prev.catch(() => {}).then(writer);
  fileWriteLocks.set(filePath, next);
  try {
    return await next;
  } finally {
    if (fileWriteLocks.get(filePath) === next) {
      fileWriteLocks.delete(filePath);
    }
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureFile(filePath, defaultContent = '') {
  await ensureDir(path.dirname(filePath));
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, 'utf8');
  }
}

export async function readJsonFile(filePath, fallback = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath, data) {
  await queueFileWrite(filePath, async () => {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  });
}

export async function readTextFile(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

export async function writeTextFile(filePath, content) {
  await queueFileWrite(filePath, async () => {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  });
}
