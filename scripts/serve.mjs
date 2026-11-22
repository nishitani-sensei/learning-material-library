import http from 'node:http';
import path from 'node:path';
import {root} from './catalog.mjs';
import {createDeveloper} from './developer.mjs';
import {readStatic, send} from './http-files.mjs';

const dir = path.join(root, 'dist');
const port = Number(process.env.PORT || 4188);
const developer = await createDeveloper(root);
const server = http.createServer(async (req, res) => {
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 400, 'このPCの確認用アドレスを開いてください。');
  const origin = `http://${host}`;
  try {
    const requested = decodeURIComponent(new URL(req.url, origin).pathname);
    if (requested === '/developer') return send(res, 302, '', undefined, {Location:'/developer/'});
    if (requested.startsWith('/developer/')) return await developer.handle(req, res, requested, origin);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'この操作は利用できません。');
    const {content, relative, type} = await readStatic(dir, requested);
    const payload = relative === 'index.html'
      ? content.toString('utf8').replace('</head>', '<meta name="local-developer" content="available"></head>')
      : content;
    return send(res, 200, payload, type);
  } catch {
    return send(res, 404, 'ファイルが見つかりません。ライブラリのホームから開き直してください。');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `すでに起動している可能性があります。http://127.0.0.1:${port}/ を開いてください。`
    : error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => void developer.close()));
}
server.listen(port, '127.0.0.1', () => console.log(`教材ライブラリ http://127.0.0.1:${port}/`));
