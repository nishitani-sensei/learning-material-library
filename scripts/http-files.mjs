import path from 'node:path';
import {readFile, stat} from 'node:fs/promises';

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.webp':'image/webp', '.pdf':'application/pdf',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
};

export function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

export async function readStatic(directory, requested) {
  const parts = requested.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || /[:\\\u0000]/.test(part))) {
    throw new Error('ファイルの場所が正しくありません。');
  }
  let file = path.join(directory, ...parts);
  if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  return {
    relative: path.relative(directory, file).split(path.sep).join('/'),
    content: await readFile(file),
    type: mime[path.extname(file)] || 'application/octet-stream',
  };
}
