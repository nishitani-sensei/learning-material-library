import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createDeveloper} from '../scripts/developer.mjs';

test('別の開発者パスワードで管理画面を開き、公開設定を変更して保存なしで試せる', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kyozai-developer-'));
  const origin = 'http://127.0.0.1:4188';
  const teacherPassword = 'temporary-teacher-password';
  const developerPassword = 'temporary-developer-password';
  const salt = 'b'.repeat(32);
  let developer;
  try {
    for (const folder of ['modules/sample/files', 'config', 'shared']) await mkdir(path.join(root, folder), {recursive:true});
    const module = {
      id:'sample', title:'試験用', audience:'student', category:'math', updated:'2026-11-22', grades:[],
      tags:[], instructions:[], sample:false, kind:'学習アプリ', description:'見本', entry:'index.html', thumbnail:'preview.svg',
    };
    await writeFile(path.join(root, 'modules/sample/module.json'), JSON.stringify(module));
    await writeFile(path.join(root, 'modules/sample/files/index.html'), '<h1>試験用</h1>');
    await writeFile(path.join(root, 'modules/sample/files/preview.svg'), '<svg/>');
    await writeFile(path.join(root, 'config/teacher-mode.json'), JSON.stringify({
      algorithm:'SHA-256', salt, digest:createHash('sha256').update(`${salt}:${teacherPassword}`).digest('hex'),
    }));
    developer = await createDeveloper(root);
    let cookie;
    async function call(route, input, source = origin) {
      const req = Readable.from(input === undefined ? [] : [JSON.stringify(input)]);
      req.method = input === undefined ? 'GET' : 'POST';
      req.headers = {cookie, origin:source, 'content-type':'application/json'};
      const res = {writeHead(status, headers) { this.status = status; this.headers = headers; }, end(content) { this.content = content; }};
      await developer.handle(req, res, `/developer/${route}`, origin);
      return res;
    }
    assert.equal((await call('api/tools')).status, 401);
    assert.equal((await call('api/login', {password:teacherPassword, confirmation:teacherPassword})).status, 400);
    const login = await call('api/login', {password:developerPassword, confirmation:developerPassword});
    assert.equal(login.status, 200);
    assert.match(login.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
    cookie = login.headers['Set-Cookie'].split(';')[0];
    const saved = await readFile(path.join(root, '.local/developer/password.json'), 'utf8');
    assert.ok(!saved.includes(developerPassword));
    const setting = {id:module.id, expected:true, published:false};
    assert.notEqual((await call('api/publication', setting, 'https://other.example')).status, 200);
    assert.equal((await call('api/publication', setting)).status, 200);
    assert.equal((await call('api/publication', setting)).status, 409);
    const preview = await call('api/preview', {id:module.id});
    assert.equal(preview.status, 200);
    const route = JSON.parse(preview.content).url.slice('/developer/'.length);
    const sample = await call(route);
    assert.equal(sample.status, 200);
    assert.match(sample.content.toString(), /試験用/);
    assert.match(sample.headers['Content-Security-Policy'], /^sandbox allow-scripts/);
    assert.ok(!sample.headers['Content-Security-Policy'].includes('allow-same-origin'));
    const row = JSON.parse((await call('api/tools')).content).tools[0];
    assert.equal(row.published, false);
    assert.equal((await call('api/logout', {})).status, 200);
    assert.equal((await call('api/tools')).status, 401);
    assert.equal((await call(route)).status, 404);
  } finally {
    await developer?.close();
    await rm(root, {recursive:true, force:true});
  }
});
