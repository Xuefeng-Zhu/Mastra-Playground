import type http from 'node:http';
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

const STATIC_FILES: Record<string, string> = {
  '/': 'dist/index.html',
  '/index.html': 'dist/index.html',
};

const STATIC_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  ico: 'image/x-icon',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

function mimeFor(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  return STATIC_MIME[extension] || 'application/octet-stream';
}

export async function serveStatic(
  path: string,
  response: http.ServerResponse,
  root: string,
): Promise<boolean> {
  const mappedFile = STATIC_FILES[path];
  if (mappedFile) {
    const fullPath = join(root, mappedFile);
    if (!existsSync(fullPath)) return false;
    response.writeHead(200, { 'Content-Type': mimeFor(fullPath) });
    response.end(await readFile(fullPath));
    return true;
  }

  if (!path.startsWith('/assets/')) return false;

  const fullPath = join(root, 'dist', path);
  const distRoot = join(root, 'dist') + sep;
  if (!fullPath.startsWith(distRoot) || !existsSync(fullPath)) return false;

  const realPath = realpathSync(fullPath);
  if (!realPath.startsWith(distRoot)) return false;

  response.writeHead(200, { 'Content-Type': mimeFor(fullPath) });
  response.end(await readFile(fullPath));
  return true;
}
