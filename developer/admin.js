const element = id => document.getElementById(id);
const signIn = element('sign-in');
const dashboard = element('dashboard');
const logout = element('logout');
const status = element('status');
const password = element('password');
const confirmPassword = element('confirm-password');
const publication = element('publication');
const savePublication = element('save-publication');
const preview = element('preview');
const frame = preview.querySelector('iframe');
let selected;
let settings;

function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function showSession({signedIn, setup}) {
  signIn.hidden = signedIn;
  dashboard.hidden = !signedIn;
  logout.hidden = !signedIn;
  if (!signedIn) {
    element('tools').replaceChildren();
    element('sign-in-heading').textContent = setup ? '開発者用パスワードを設定' : '開発者用をひらく';
    element('sign-in-note').textContent = setup
      ? '先生用とは別に、12文字以上のパスワードを設定してください。'
      : '開発者用のパスワードを入力してください。';
    password.autocomplete = setup ? 'new-password' : 'current-password';
    element('confirm-label').hidden = confirmPassword.hidden = !setup;
    confirmPassword.required = setup;
    element('login').querySelector('button').textContent = setup ? '設定してひらく' : '開発者用をひらく';
  }
}

async function request(action, data) {
  const response = await fetch(`./api/${action}`, data === undefined ? {} : {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') {
      if (publication.open) publication.close();
      if (preview.open) preview.close();
      showSession({signedIn:false, setup:false});
      throw new Error('開発者モードの有効時間が終わりました。もう一度ひらいてください。');
    }
    throw new Error(result.message || '操作を完了できませんでした。');
  }
  return result;
}

function button(label, listener, title) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'secondary';
  control.textContent = label;
  control.setAttribute('aria-label', `${title}を${label}`);
  control.addEventListener('click', listener);
  return control;
}

function draw({tools}) {
  settings = JSON.stringify({unpublished:tools.filter(tool => !tool.published).map(tool => tool.id).sort()}, null, 2) + '\n';
  const rows = tools.sort((a, b) => a.title.localeCompare(b.title, 'ja')).map(tool => {
    const row = document.createElement('tr');
    const title = document.createElement('th');
    title.scope = 'row';
    title.textContent = tool.title;
    const info = document.createElement('span');
    info.className = 'info';
    info.textContent = `${tool.audience === 'teacher' ? '先生用' : '児童用'} · ${tool.updated} 更新`;
    title.append(info);
    row.append(title);
    const controls = row.insertCell();
    const label = document.createElement('span');
    label.className = 'publication-label';
    label.textContent = tool.published ? '公開' : '非公開';
    controls.append(label, button(tool.published ? '非公開にする' : '公開する', () => askPublication(tool), tool.title));
    row.insertCell().append(button('保存なしで開く', event => openPreview(tool, event.currentTarget), tool.title));
    return row;
  });
  element('tools').replaceChildren(...rows);
}

function askPublication(tool) {
  selected = tool;
  element('publication-title').textContent = `${tool.title}を${tool.published ? '非公開' : '公開'}に設定しますか？`;
  element('publication-note').textContent = tool.published
    ? '次回の公開で一覧とアプリ本体を教材ライブラリから取り下げます。公開済みのGitHub上のファイルは引き続き参照できます。'
    : '次回の公開でアプリが教材ライブラリから使えるようになります。';
  publication.showModal();
}

async function openPreview(tool, control) {
  control.disabled = true;
  announce('動作確認を準備しています。');
  try {
    const result = await request('preview', {id:tool.id});
    element('preview-title').textContent = tool.title;
    frame.src = result.url;
    preview.showModal();
    announce('');
  } catch (error) { announce(error.message, true); }
  finally { control.disabled = false; }
}

async function refresh() {
  try { draw(await request('tools')); }
  catch (error) { announce(error.message, true); }
}

element('login').addEventListener('submit', async event => {
  event.preventDefault();
  const control = event.target.querySelector('button');
  control.disabled = true;
  announce('');
  try {
    showSession(await request('login', {password:password.value, confirmation:confirmPassword.value}));
    await refresh();
    if (!dashboard.hidden) element('refresh').focus();
  } catch (error) { announce(error.message, true); password.focus(); }
  finally { password.value = confirmPassword.value = ''; control.disabled = false; }
});
element('refresh').addEventListener('click', async () => { announce(''); await refresh(); });
element('copy-settings').addEventListener('click', async () => {
  if (!settings) return;
  try {
    await navigator.clipboard.writeText(settings);
    announce('設定をコピーしました。GitHubの編集画面に貼り付けて保存してください。');
  } catch { announce('コピーできませんでした。制作フォルダーの公開設定ファイルを開いてください。', true); }
});
logout.addEventListener('click', async () => {
  try {
    await request('logout', {});
    showSession({signedIn:false, setup:false});
    announce('開発者モードを終了しました。');
    password.focus();
  } catch (error) { announce(error.message, true); }
});
element('cancel-publication').addEventListener('click', () => publication.close());
publication.addEventListener('cancel', event => { if (savePublication.disabled) event.preventDefault(); });
savePublication.addEventListener('click', async () => {
  const {id, published, title} = selected;
  savePublication.disabled = true;
  element('cancel-publication').disabled = true;
  try {
    const result = await request('publication', {id, published:!published, expected:published});
    publication.close();
    draw(result);
    announce(`${title}の設定を保存しました。次回の公開で反映されます。`);
    element('refresh').focus();
  } catch (error) {
    if (publication.open) publication.close();
    announce(error.message, true);
  } finally {
    savePublication.disabled = false;
    element('cancel-publication').disabled = false;
  }
});
element('close-preview').addEventListener('click', () => preview.close());
preview.addEventListener('close', () => { frame.removeAttribute('src'); });

try {
  const session = await request('session');
  showSession(session);
  if (session.signedIn) await refresh();
} catch (error) { announce(error.message, true); }
