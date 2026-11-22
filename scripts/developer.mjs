import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copyModuleFiles, readModules, readPublication, verifyModuleFiles} from './catalog.mjs';
import {readStatic, send} from './http-files.mjs';

const prefix = '/developer/';
const cookieName = 'kyozai-developer';
const sessionLength = 60 * 60 * 1000;
const token = () => randomBytes(24).toString('hex');
const cookie = (value, age) => `${cookieName}=${value}; Path=${prefix}; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const json = (res, status, value, headers) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', headers);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const derive = (password, salt) => scryptSync(password, Buffer.from(salt, 'hex'), 32);

class ClientError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function body(req) {
  if (req.headers['content-type'] !== 'application/json') throw new ClientError(415, '入力形式を確認してください。');
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 4096) throw new ClientError(413, '入力が長すぎます。');
  }
  try { return JSON.parse(input); }
  catch { throw new ClientError(400, '入力内容を確認してください。'); }
}

export async function createDeveloper(projectRoot) {
  const directory = path.join(projectRoot, '.local', 'developer');
  const credentialsFile = path.join(directory, 'password.json');
  const publicationFile = path.join(projectRoot, 'config', 'publication.json');
  const assetsDir = path.join(projectRoot, 'developer');
  const sessions = new Map();
  let failures = 0, retryAt = 0, publicationQueue = Promise.resolve();
  await mkdir(directory, {recursive: true});

  async function readCredentials() {
    try { return await readJson(credentialsFile); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
  }

  async function endSession(id) {
    const session = sessions.get(id);
    sessions.delete(id);
    if (session?.preview) await removePreview(session.preview);
  }

  async function removePreview(preview) {
    try { await rm(preview.directory, {recursive: true, force: true}); }
    catch (error) { console.error('動作確認用の一時ファイルを片付けられませんでした。', error.code); }
  }

  function expireSessions() {
    for (const [id, session] of sessions) if (session.expires <= Date.now()) void endSession(id);
  }

  async function authenticate(req, res) {
    if (Date.now() < retryAt) throw new ClientError(429, '入力を繰り返したため、30秒ほど置いてからお試しください。');
    const {password, confirmation} = (await body(req)) ?? {};
    if (typeof password !== 'string' || password.length < 12 || password.length > 128 || password !== password.trim()) {
      throw new ClientError(400, 'パスワードは前後の空白を除いて12〜128文字にしてください。');
    }
    let saved = await readCredentials();
    if (!saved) {
      if (password !== confirmation) throw new ClientError(400, '確認用の入力と同じパスワードにしてください。');
      const teacher = await readJson(path.join(projectRoot, 'config', 'teacher-mode.json'));
      const digest = createHash('sha256').update(`${teacher.salt}:${password}`).digest('hex');
      if (digest === teacher.digest) throw new ClientError(400, '先生用とは別のパスワードにしてください。');
      const salt = randomBytes(16).toString('hex');
      saved = {salt, digest: derive(password, salt).toString('hex')};
      try { await writeFile(credentialsFile, JSON.stringify(saved) + '\n', {flag: 'wx', mode: 0o600}); }
      catch (error) {
        if (error.code === 'EEXIST') throw new ClientError(409, 'パスワードが設定されました。ページを開き直してください。');
        throw error;
      }
    }
    if (!timingSafeEqual(derive(password, saved.salt), Buffer.from(saved.digest, 'hex'))) {
      if (++failures >= 5) { failures = 0; retryAt = Date.now() + 30000; }
      throw new ClientError(401, '開発者用パスワードが違います。');
    }
    failures = 0;
    const id = token();
    sessions.set(id, {expires: Date.now() + sessionLength});
    return json(res, 200, {signedIn:true}, {'Set-Cookie':cookie(id, sessionLength / 1000)});
  }

  async function dashboard(res) {
    const modules = await readModules(projectRoot);
    const unpublished = await readPublication(projectRoot, modules);
    return json(res, 200, {tools:modules.map(({id, title, audience, updated}) => ({
      id, title, audience, updated, published:!unpublished.has(id),
    }))});
  }

  async function changePublication(req, res) {
    const {id, published, expected} = (await body(req)) ?? {};
    if (typeof published !== 'boolean' || typeof expected !== 'boolean') throw new ClientError(400, '公開設定を確認してください。');
    const change = publicationQueue.then(async () => {
      const modules = await readModules(projectRoot);
      const module = modules.find(item => item.id === id);
      if (!module) throw new ClientError(404, '対象のアプリが見つかりません。');
      const unpublished = await readPublication(projectRoot, modules);
      if (unpublished.has(id) === expected) throw new ClientError(409, '別の画面で公開設定が変わりました。画面を更新してください。');
      if (published) { await verifyModuleFiles(projectRoot, module); unpublished.delete(id); }
      else unpublished.add(id);
      const pending = `${publicationFile}.${token()}.tmp`;
      try {
        await writeFile(pending, JSON.stringify({unpublished:[...unpublished].sort()}, null, 2) + '\n', {flag:'wx'});
        await rename(pending, publicationFile);
      } finally { await rm(pending, {force:true}); }
    });
    publicationQueue = change.catch(() => {});
    await change;
    return dashboard(res);
  }

  async function preparePreview(req, res, session, sessionId) {
    const {id} = (await body(req)) ?? {};
    const module = (await readModules(projectRoot)).find(item => item.id === id);
    if (!module) throw new ClientError(404, '対象のアプリが見つかりません。');
    await verifyModuleFiles(projectRoot, module);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'kyozai-preview-'));
    const previous = session.preview;
    const key = token();
    try {
      await copyModuleFiles(projectRoot, module, path.join(directory, 'tools', module.id));
      await cp(path.join(projectRoot, 'shared'), path.join(directory, 'shared'), {recursive: true});
      if (!sessions.has(sessionId) || session.expires <= Date.now() || session.preview !== previous) {
        throw new ClientError(409, '画面の状態が変わりました。開き直してください。');
      }
    } catch (error) { await removePreview({directory}); throw error; }
    session.preview = {key, directory};
    if (previous) await removePreview(previous);
    const entry = module.entry.split('/').map(encodeURIComponent).join('/');
    return json(res, 200, {url:`${prefix}preview/${key}/tools/${module.id}/${entry}`});
  }

  async function servePreview(res, requestPath, origin) {
    const [, key, file] = /^\/developer\/preview\/([0-9a-f]{48})\/(.*)$/.exec(requestPath) ?? [];
    const preview = key && [...sessions.values()].find(session => session.preview?.key === key)?.preview;
    if (!preview) throw new ClientError(404, '動作確認を開き直してください。');
    const {content, type} = file ? await readStatic(preview.directory, file) : {
      content:'<!doctype html><html lang="ja"><meta charset="utf-8"><title>動作確認</title><p>画面上の「閉じる」でアプリ一覧に戻ります。</p></html>',
      type:'text/html; charset=utf-8',
    };
    const previewBase = `${origin}${prefix}preview/${key}/`;
    return send(res, 200, content, type, {
      'Access-Control-Allow-Origin':'*',
      'Referrer-Policy':'no-referrer',
      'Content-Security-Policy':`sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${previewBase}; style-src 'unsafe-inline' ${previewBase}; img-src data: blob: ${previewBase}; font-src data: ${previewBase}; connect-src ${previewBase}; form-action 'none'; base-uri 'none'; frame-ancestors ${origin}`,
    });
  }

  async function handle(req, res, requestPath, origin) {
    expireSessions();
    try {
      if (req.method === 'GET' && requestPath.startsWith(`${prefix}preview/`)) return await servePreview(res, requestPath, origin);
      const sessionId = /(?:^|;\s*)kyozai-developer=([0-9a-f]{48})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      const session = sessions.get(sessionId);
      if (req.method === 'GET') {
        if (requestPath === `${prefix}api/session`) return json(res, 200, {signedIn:!!session, setup:!await readCredentials()});
        if (requestPath === `${prefix}api/tools` && session) return await dashboard(res);
        const file = {'/developer/':'index.html', '/developer/admin.css':'admin.css', '/developer/admin.js':'admin.js'}[requestPath];
        if (file) {
          const {content, type} = await readStatic(assetsDir, file);
          return send(res, 200, content, type, {
            'Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            'Referrer-Policy':'no-referrer',
          });
        }
      }
      if (req.method === 'POST' && req.headers.origin === origin) {
        if (requestPath === `${prefix}api/login`) return await authenticate(req, res);
        if (session && requestPath === `${prefix}api/logout`) {
          await endSession(sessionId);
          return json(res, 200, {}, {'Set-Cookie':cookie('', 0)});
        }
        if (session && requestPath === `${prefix}api/publication`) return await changePublication(req, res);
        if (session && requestPath === `${prefix}api/preview`) return await preparePreview(req, res, session, sessionId);
      }
      throw new ClientError(session ? 404 : 401, session ? 'ページを確認してください。' : '開発者用のログインが必要です。');
    } catch (error) {
      if (error instanceof ClientError) return json(res, error.status, {message:error.message});
      if (error.code === 'ENOENT') return json(res, 404, {message:'ファイルが見つかりません。'});
      console.error('開発者用の処理を完了できませんでした。', error.code ?? error.name);
      return json(res, 500, {message:'処理できませんでした。制作フォルダーを確認してください。'});
    }
  }

  return {handle, async close() {
    await Promise.all([...sessions.keys()].map(endSession));
  }};
}
