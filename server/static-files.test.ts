import type http from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serveStatic } from './static-files.js';

describe('serveStatic', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mastra-static-'));
    await mkdir(join(root, 'dist', 'assets'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function response() {
    const writeHead = vi.fn();
    const end = vi.fn();
    return { value: { writeHead, end } as unknown as http.ServerResponse, writeHead, end };
  }

  it('serves the Vite index with the correct content type', async () => {
    await writeFile(join(root, 'dist', 'index.html'), '<main>ready</main>');
    const res = response();

    expect(await serveStatic('/', res.value, root)).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html; charset=utf-8' });
    expect(res.end.mock.calls[0][0].toString()).toContain('ready');
  });

  it('rejects asset symlinks that escape dist', async () => {
    const outside = join(root, 'secret.txt');
    await writeFile(outside, 'secret');
    await symlink(outside, join(root, 'dist', 'assets', 'leak.txt'));
    const res = response();

    expect(await serveStatic('/assets/leak.txt', res.value, root)).toBe(false);
    expect(res.end).not.toHaveBeenCalled();
  });
});
