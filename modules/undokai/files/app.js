(function () {
  'use strict';

  const M = globalThis.Undokai;
  const { TYPE, OUTCOME, RELAY, STATES } = M;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const attribute = value => esc(value);
  const resultText = result => Array.isArray(result.input) ? result.input.map((team, i) => `${i + 1}着 ${team}`).join('、') : result.input;
  const pointsText = ([red, white]) => `赤 ${format(red)}点 ／ 白 ${format(white)}点`;
  const format = value => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 8 }).format(value);
  const stamp = () => new Date().toISOString();
  const action = (label, name, id = '', css = '', disabled = false) => `<button type="button" class="${css}" data-action="${name}" data-id="${attribute(id)}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const option = (value, selected, label = value) => `<option value="${attribute(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const field = (label, control) => `<label class="field">${esc(label)}${control}</label>`;
  const input = (name, type, value, attributes = '') => `<input name="${name}" type="${type}" value="${attribute(value)}" ${attributes}>`;
  const textInput = (name, value, required = false) => input(name, 'text', value, `maxlength="150" ${required ? 'required' : ''}`);
  const rulesFor = (event, type) => event.rules.filter(rule => rule.type === type);
  const timingFor = (event, programId) => event.timings.find(timing => timing.programId === programId) || { programId, status: '開始前', start: '', end: '', reason: '' };
  const resultFor = (event, programId, grade, race) => event.results.find(result => M.resultKey(result) === M.key(programId, grade, race));
  const ruleFor = (event, program) => event.rules.find(rule => rule.id === program.ruleId);
  const hasResults = (event, programId) => event.results.some(result => result.programId === programId);
  const time = value => M.dateTime(value).slice(11) || '—';
  const fieldValue = value => M.dateTime(value).replace(' ', 'T');
  const eventLabel = event => [event.date, event.name].filter(Boolean).join('　');
  const STORE_KEY = `undokai-static-v1:${location.pathname.replace(/index\.html$/, '').replace(/\/$/, '')}`;

  let store;
  let storedRaw;
  let display = 'progress';
  let storageReady = false;
  let modalSubmit;
  let toastTimer;

  function current(data = store) { return data.events.find(event => event.id === data.active); }

  function start() {
    try {
      storedRaw = localStorage.getItem(STORE_KEY);
      if (storedRaw === null) {
        const first = M.createEvent();
        storedRaw = JSON.stringify({ version: 1, active: first.id, events: [first] });
      }
      store = M.validateStore(JSON.parse(storedRaw));
      localStorage.setItem(STORE_KEY, storedRaw);
      storageReady = true;
    } catch (error) {
      const first = M.createEvent();
      store = { version: 1, active: first.id, events: [first] };
      $('storage-error').hidden = false;
      $('storage-error').textContent = '端末の保存データを開けません。通常のブラウザで開き直し、設定や得点を入力する前に保存状態を確認してください。';
    }
    render();
    prepareOffline();
  }

  function commit(change) {
    if (!storageReady) throw new Error('端末に保存できません。ブラウザの保存設定を確認してください。');
    try {
      if (localStorage.getItem(STORE_KEY) !== storedRaw) throw new Error('別の画面で記録が更新されました。この画面を開き直してください。');
    } catch (error) { throw new Error(error.message || '端末の保存データを確認できません。'); }
    const next = M.clone(store);
    change(current(next), next);
    M.validateStore(next);
    const raw = JSON.stringify(next);
    try { localStorage.setItem(STORE_KEY, raw); }
    catch { throw new Error('保存に失敗しました。空き容量とブラウザの保存設定を確認してください。'); }
    storedRaw = raw;
    store = next;
    render();
  }

  function history(event, label, reason = '') { event.history.push({ at: stamp(), label, reason }); }

  function notify(text) {
    clearTimeout(toastTimer);
    $('message').textContent = text;
    $('message').hidden = false;
    toastTimer = setTimeout(() => { $('message').hidden = true; }, 5000);
  }

  function show(view) {
    display = view;
    document.body.classList.toggle('printing', view === 'report');
    document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== view; });
    document.querySelectorAll('.tabs button').forEach(button => {
      if (button.dataset.view === view || view === 'report' && button.dataset.view === 'records') button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    const event = current();
    $('title').textContent = event.name;
    $('school').textContent = [event.school, event.date].filter(Boolean).join('　');
    $('save-status').textContent = storageReady ? 'このブラウザに保存' : '端末への保存不可';
    const [red, white] = M.totals(event, $('drafts').checked);
    $('red-score').textContent = format(red);
    $('white-score').textContent = format(white);
    if (display === 'progress') renderProgress(event);
    if (display === 'scoring') renderScoring(event);
    if (display === 'settings') renderSettings(event);
    if (display === 'records') renderRecords(event);
    if (display === 'report') renderReport(event);
  }

  function renderProgress(event) {
    $('programs').innerHTML = event.programs.map((program, i) => {
      const t = timingFor(event, program.id);
      const statusStyle = { '進行中': 'live', '中止': 'canceled' }[t.status] || '';
      return `<article class="card ${t.status === '進行中' ? 'running' : ''}">
        <div class="card-row"><div><h3>${i + 1}. ${esc(program.name)}</h3><p class="meta">${esc(program.target)} · ${program.type}</p></div><span class="pill ${statusStyle}">${t.status}</span></div>
        <p class="time">開始 ${time(t.start)}　終了 ${time(t.end)}</p>
        ${program.note ? `<p class="meta">${esc(program.note)}</p>` : ''}${t.reason ? `<p>${esc(t.reason)}</p>` : ''}
        <div class="actions">${t.status === '開始前' ? action('開始', 'start', program.id, 'start') : ''}${t.status === '進行中' ? action('終了', 'finish', program.id, 'finish') : ''}${action('時刻修正', 'timing', program.id)}${['開始前', '進行中'].includes(t.status) ? action('中止', 'cancel-program', program.id) : ''}</div>
      </article>`;
    }).join('') || '<p class="card">「設定」からプログラムを追加してください。</p>';
  }

  function renderScoring(event) {
    $('score-programs').innerHTML = event.programs.filter(program => program.type !== TYPE.NONE).map(program => {
      const canceled = timingFor(event, program.id).status === '中止';
      if (canceled) return `<article class="card"><h3>${esc(program.name)}</h3><span class="pill canceled">中止</span></article>`;
      const units = M.unitList(program);
      const groups = program.type === TYPE.SPRINT ? M.grades(program.target) : [''];
      const rule = ruleFor(event, program);
      return `<article class="card"><h3>${esc(program.name)}</h3><p class="meta">${esc(program.target)} · ${esc(rule.name)}</p>${groups.map(grade => {
        const rows = units.filter(unit => unit.grade === grade).map(unit => {
          const result = resultFor(event, program.id, unit.grade, unit.race);
          const status = result ? result.confirmed ? '確定' : '仮保存' : '未入力';
          return `<div class="card-row"><div><strong>${grade ? `第${unit.race}レース` : '競技結果'}</strong> <span class="pill ${result ? result.confirmed ? 'confirmed' : 'draft' : ''}">${status}</span>${result ? `<p class="meta">${pointsText(M.score(rule, result.input))}</p>` : ''}</div>${action(result ? '確認・修正' : '入力', 'score', M.key(program.id, unit.grade, unit.race), result ? '' : 'primary')}</div>`;
        }).join('');
        return `<section class="grade">${grade ? `<h4>${grade} <span class="meta">${$('drafts').checked ? '速報' : '確定小計'} ${pointsText(M.totals(event, $('drafts').checked, program.id, grade))}</span></h4>` : ''}${rows}</section>`;
      }).join('')}</article>`;
    }).join('') || '<p class="card">得点競技がありません。</p>';
  }

  function describeRule(rule) {
    return rule.type === TYPE.GROUP
      ? OUTCOME.map((outcome, i) => `${outcome} ${pointsText(rule.points.slice(i * 2, i * 2 + 2))}`).join('　')
      : rule.points.map((points, i) => `${i + 1}着 ${points === null ? '未設定' : `${format(points)}点`}`).join('　');
  }

  function renderSettings(event) {
    $('event-picker').innerHTML = store.events.map(item => option(item.id, event.id, eventLabel(item))).join('');
    $('rules').innerHTML = event.rules.map(rule => `<article class="card"><h4>${esc(rule.name)}</h4><p class="meta">${rule.type}</p><p>${esc(describeRule(rule))}</p>${action('配点を編集', 'rule-edit', rule.id)}</article>`).join('');
    $('program-settings').innerHTML = event.programs.map((program, i) => {
      const rule = ruleFor(event, program);
      const races = program.type === TYPE.SPRINT ? M.grades(program.target).map(grade => `${grade} ${program.counts[grade]}レース`).join(' ／ ') : '';
      return `<article class="card"><div class="card-row"><div><h4>${i + 1}. ${esc(program.name)}</h4><p class="meta">${esc([program.type, program.target, rule?.name, races].filter(Boolean).join(' · '))}</p></div>
        <div class="actions">${action('編集', 'program-edit', program.id)}${action('前へ', 'move-up', program.id, '', i === 0)}${action('後へ', 'move-down', program.id, '', i === event.programs.length - 1)}</div></div></article>`;
    }).join('') || '<p class="card">プログラムがありません。</p>';
  }

  function reportBlockers(event) {
    const pending = [];
    if (!event.programs.length) pending.push('プログラムがありません');
    event.programs.forEach(program => {
      const timing = timingFor(event, program.id);
      if (timing.status === '中止') return;
      if (timing.status === '進行中') pending.push(`${program.name}の終了時刻`);
      M.unitList(program).forEach(unit => {
        if (!resultFor(event, program.id, unit.grade, unit.race)?.confirmed) pending.push(`${program.name} ${unit.label}の得点`);
      });
    });
    return pending;
  }

  function renderRecords(event) {
    const blockers = reportBlockers(event);
    $('record-status').textContent = blockers.length ? `未完了 ${blockers.length}件（${blockers.slice(0, 3).join('、')}${blockers.length > 3 ? ' ほか' : ''}）` : '記録を出力できます。';
    $('report-button').disabled = blockers.length > 0;
    $('history').innerHTML = event.history.slice().reverse().map(item => `<div><p class="meta">${M.dateTime(item.at)}</p><p>${esc(item.label)}${item.reason ? `（${esc(item.reason)}）` : ''}</p></div>`).join('') || '<p>修正履歴はありません。</p>';
  }

  function table(columns, rows) {
    return `<div class="table-wrap"><table class="report-table"><thead><tr>${columns.map(column => `<th scope="col">${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderReport(event) {
    const scoreRows = [];
    const timeRows = [];
    event.programs.forEach((program, i) => {
      const t = timingFor(event, program.id);
      timeRows.push([i + 1, program.name, time(t.start), time(t.end), [t.status, t.reason].filter(Boolean).join('　')]);
      if (t.status === '中止' || program.type === TYPE.NONE) return;
      const rule = ruleFor(event, program);
      const units = M.unitList(program);
      const groups = program.type === TYPE.SPRINT ? M.grades(program.target) : [''];
      groups.forEach(grade => {
        units.filter(unit => unit.grade === grade).forEach(unit => {
          const result = resultFor(event, program.id, grade, unit.race);
          if (result?.confirmed) scoreRows.push([program.name, unit.label, resultText(result), ...M.score(rule, result.input).map(format)]);
        });
        if (grade) scoreRows.push([program.name, `${grade} 小計`, '', ...M.totals(event, false, program.id, grade).map(format)]);
      });
    });
    const total = M.totals(event);
    const winner = total[0] === total[1] ? '引き分け' : total[0] > total[1] ? '赤組 優勝' : '白組 優勝';
    $('print-content').innerHTML = `<h2 id="report-title">${esc(event.name)} 公式記録</h2><p>${esc([event.school, event.date].filter(Boolean).join('　'))}</p>
      <h3>最終総合得点</h3><p>${pointsText(total)}　${winner}</p>
      <h3>プログラム・時刻</h3>${table(['順', 'プログラム', '開始', '終了', '状態'], timeRows)}
      <h3>競技別得点</h3>${scoreRows.length ? table(['競技', '内訳', '順位・勝敗', '赤', '白'], scoreRows) : '<p>得点競技なし</p>'}
      ${event.history.length ? '<h3>変更履歴</h3>' + table(['日時', '内容', '理由'], event.history.map(item => [M.dateTime(item.at), item.label, item.reason])) : ''}`;
  }

  function openDialog(title, content, submit, buttons = [{ value: 'save', label: '保存', primary: true }], extra = '') {
    $('dialog-title').textContent = title;
    $('dialog-content').innerHTML = content;
    $('dialog-error').hidden = true;
    $('dialog-actions').innerHTML = extra + action('戻る', 'close') + buttons.map(button => `<button type="submit" value="${button.value}" class="${button.primary ? 'primary' : ''}">${button.label}</button>`).join('');
    modalSubmit = submit;
    $('dialog').showModal();
  }

  function failDialog(error) {
    $('dialog-error').textContent = error.message || '操作を完了できませんでした。';
    $('dialog-error').hidden = false;
  }

  $('dialog-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('dialog-form').dataset.busy) return;
    const form = $('dialog-form');
    form.dataset.busy = 'yes';
    $('dialog-error').hidden = true;
    try {
      await modalSubmit(new FormData(form), event.submitter?.value, form);
      $('dialog').close();
      notify('このブラウザに保存しました。');
    } catch (error) { failDialog(error); }
    finally { delete form.dataset.busy; }
  });

  function eventDialog(copy) {
    const event = current();
    openDialog(copy ? '設定をコピーして次の大会を作る' : '大会情報を編集',
      field('大会名', textInput('name', copy ? `${event.name}（新年度）`.slice(0, 150) : event.name, true)) +
      field('学校名', textInput('school', event.school)) + field('開催日', input('date', 'date', copy ? '' : event.date)), data => {
        commit((previous, next) => {
          const edited = copy ? { ...M.clone(previous), id: M.id(), results: [], timings: [], history: [] } : previous;
          edited.name = String(data.get('name')).trim();
          edited.school = String(data.get('school')).trim();
          edited.date = data.get('date');
          if (copy) { next.events.push(edited); next.active = edited.id; }
        });
      });
  }

  function ruleDialog(ruleId) {
    const event = current();
    const original = event.rules.find(rule => rule.id === ruleId);
    const affected = original && event.programs.filter(program => program.ruleId === ruleId && hasResults(event, program.id));
    const body = field('配点名', textInput('name', original?.name || '', true)) +
      (original ? `<p>${original.type}</p>` : field('種別', `<select name="type">${M.defaultRules().map(rule => option(rule.type)).join('')}</select>`)) +
      '<div id="point-fields" class="fields"></div>' + (affected?.length ? `<p class="hint">変更すると、${esc(affected.map(program => program.name).join('、'))}の入力済み得点も、確定済みを含めて再計算します。</p>${field('配点を変更する理由', '<textarea name="reason" maxlength="1000"></textarea>')}` : '');
    openDialog(original ? '配点を編集' : '配点を追加', body, (data, _, form) => {
      const type = original?.type || data.get('type');
      const points = [...form.querySelectorAll('#point-fields input')].map(element => element.value === '' ? null : element.valueAsNumber);
      const revised = { id: original?.id || M.id(), name: String(data.get('name')).trim(), type, points };
      const changed = original && original.points.some((point, i) => point !== points[i]);
      const reason = String(data.get('reason') || '').trim();
      if (changed && affected?.length && !reason) throw new Error('入力済みの得点があるため、配点の変更理由を入力してください。');
      commit(draft => {
        const index = draft.rules.findIndex(rule => rule.id === revised.id);
        if (index < 0) draft.rules.push(revised);
        else draft.rules[index] = revised;
        if (changed) history(draft, `${revised.name}の配点を変更。変更前 ${describeRule(original)}。変更後 ${describeRule(revised)}`, reason);
      });
    });
    const draw = type => {
      const rule = original || M.defaultRules().find(item => item.type === type);
      const labels = type === TYPE.GROUP ? OUTCOME.flatMap(outcome => [`${outcome}・赤組`, `${outcome}・白組`]) : rule.points.map((_, i) => `${i + 1}着`);
      $('point-fields').innerHTML = labels.map((label, i) => field(label, input(`point-${i}`, 'number', rule.points[i], `step="any"${type === TYPE.GROUP ? ' required' : ''}`))).join('');
    };
    const typeField = $('dialog-form').elements.namedItem('type');
    draw(original?.type || typeField.value);
    typeField?.addEventListener('change', () => draw(typeField.value));
  }

  function programDialog(programId) {
    const event = current();
    const program = event.programs.find(item => item.id === programId);
    const recorded = program && hasResults(event, program.id);
    const canRemove = program && !recorded && !event.timings.some(item => item.programId === program.id);
    const initial = program || { id: M.id(), name: '', type: TYPE.NONE, target: '全校', counts: {}, ruleId: '', note: '' };
    openDialog(program ? 'プログラムを編集' : 'プログラムを追加',
      field('名称', textInput('name', initial.name, true)) + field('種別', `<select name="type"${recorded ? ' disabled' : ''}>${Object.values(TYPE).map(type => option(type, initial.type)).join('')}</select>`) +
      '<div id="program-options"></div>' + field('備考', `<textarea name="note" maxlength="1000">${esc(initial.note)}</textarea>`) +
      (recorded ? '<p class="hint">配点を変えると、確定済みを含むこのプログラムの得点を再計算します。</p>' + field('配点を変更する理由', '<textarea name="reason" maxlength="1000"></textarea>') : ''), data => {
        const type = recorded ? initial.type : data.get('type');
        const target = recorded ? initial.target : String(data.get('target') || '').trim();
        const counts = type === TYPE.SPRINT ? Object.fromEntries(M.grades(target).map(grade => [grade, Number(data.get('count-' + grade))])) : {};
        const revised = { id: initial.id, name: String(data.get('name')).trim(), type, target, counts, ruleId: data.get('ruleId') || '', note: String(data.get('note')).trim() };
        const changedRule = recorded && revised.ruleId !== initial.ruleId;
        const reason = String(data.get('reason') || '').trim();
        if (changedRule && !reason) throw new Error('入力済みの得点があるため、配点の変更理由を入力してください。');
        commit(draft => {
          const index = draft.programs.findIndex(item => item.id === revised.id);
          if (index < 0) draft.programs.push(revised);
          else draft.programs[index] = revised;
          if (changedRule) history(draft, `${revised.name}の配点を「${ruleFor(event, initial).name}」から「${ruleFor(draft, revised).name}」へ変更`, reason);
        });
      }, undefined, canRemove ? action('削除', 'program-delete', program.id, 'danger') : '');
    const form = $('dialog-form');
    const typeField = form.elements.namedItem('type');
    const groups = ['低学年', '中学年', '高学年', ...M.GRADES];
    function drawOptions(type, target, ruleId) {
      const rules = rulesFor(event, type);
      const targetInput = type === TYPE.SPRINT
        ? `<select name="target"${recorded ? ' disabled' : ''}>${groups.map(group => option(group, target)).join('')}</select>`
        : input('target', 'text', target, `maxlength="150" ${recorded ? 'disabled' : ''}`);
      $('program-options').innerHTML = field('対象学年・区分', targetInput) + '<div id="race-counts" class="fields"></div>' +
        (type === TYPE.NONE ? '' : field('使用する配点', `<select name="ruleId" required>${rules.length ? rules.map(rule => option(rule.id, ruleId, rule.name)).join('') : '<option value="">「配点を追加」から作成してください</option>'}</select>`));
      if (type !== TYPE.SPRINT) return;
      const targetField = form.elements.namedItem('target');
      function drawRaces() {
        const previous = Object.fromEntries([...$('race-counts').querySelectorAll('input')].map(element => [element.name.slice(6), element.value]));
        $('race-counts').innerHTML = M.grades(recorded ? initial.target : targetField.value).map(grade => field(`${grade} レース数`, input(`count-${grade}`, 'number', previous[grade] || initial.counts[grade] || 1, 'min="1" max="99" step="1" required'))).join('');
      }
      drawRaces();
      targetField.addEventListener('change', drawRaces);
    }
    const normalizeTarget = target => M.grades(target).length === 1 ? M.grades(target)[0] : target;
    drawOptions(initial.type, normalizeTarget(initial.target), initial.ruleId);
    typeField.addEventListener('change', () => drawOptions(typeField.value, normalizeTarget(initial.target), initial.ruleId));
  }

  function choices(name, items, selected) {
    return `<div class="choices">${items.map(([value, label]) => `<label class="choice"><input type="radio" name="${name}" value="${attribute(value)}"${value === selected ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
  }

  function scoreDialog(identifier) {
    const [programId, grade, race] = JSON.parse(identifier);
    const event = current();
    const program = event.programs.find(item => item.id === programId);
    if (timingFor(event, programId).status === '中止') throw new Error('中止した競技には得点を入力できません。');
    const rule = ruleFor(event, program);
    const previous = resultFor(event, programId, grade, race);
    const sprint = program.type === TYPE.SPRINT;
    const group = program.type === TYPE.GROUP;
    const rankCount = sprint ? 6 : 4;
    const controls = group ? choices('outcome', OUTCOME.map(outcome => [outcome, outcome]), previous?.input)
      : Array.from({ length: rankCount }, (_, i) => {
        const items = sprint ? [['赤', '赤組'], ['白', '白組'], ['', '空欄']] : RELAY.map(team => [team, `${team}チーム`]);
        return `<div class="rank" role="group" aria-label="${i + 1}着"><span class="rank-label">${i + 1}着</span>${choices(`rank${i}`, items, previous?.input[i] || '')}</div>`;
      }).join('');
    function readScore(data) {
      if (group) return data.get('outcome');
      const ranked = Array.from({ length: rankCount }, (_, i) => data.get(`rank${i}`) || '');
      if (sprint) {
        while (ranked.length && !ranked[ranked.length - 1]) ranked.pop();
      }
      return ranked;
    }
    const info = sprint ? '出走人数分を1着から順に選びます。出走者がいない着順は空欄にします。' : group ? '' : '1着から順に選びます。赤・黄は赤組、白・青は白組に加算します。';
    const title = [program.name, grade && `${grade} 第${race}レース`].filter(Boolean).join(' ');
    openDialog(title, (info ? `<p class="hint">${info}</p>` : '') + controls + '<p class="hint" id="score-preview" aria-live="polite"></p>' +
      (previous?.confirmed ? field('修正理由', '<textarea name="reason" maxlength="1000" required></textarea>') : ''), (data, button) => {
        const value = readScore(data);
        M.score(rule, value);
        const reason = String(data.get('reason') || '').trim();
        if (previous?.confirmed && !reason) throw new Error('修正理由を入力してください。');
        commit(draft => {
          const index = draft.results.findIndex(result => M.resultKey(result) === identifier);
          const result = { programId, grade, race, input: value, confirmed: button === 'confirm' };
          if (index < 0) draft.results.push(result);
          else draft.results[index] = result;
          if (previous?.confirmed) history(draft, `${title}の得点を修正。変更前 ${resultText(previous)}。変更後 ${resultText(result)}（${result.confirmed ? '確定' : '仮保存'}）`, reason);
        });
      }, [{ value: 'draft', label: '仮保存' }, { value: 'confirm', label: '得点を確定', primary: true }]);
    const form = $('dialog-form');
    const update = () => {
      try { $('score-preview').textContent = pointsText(M.score(rule, readScore(new FormData(form)))); }
      catch { $('score-preview').textContent = '着順・勝敗を入力すると得点を表示します。'; }
    };
    $('dialog-content').addEventListener('change', update, { signal: closeSignal() });
    update();
  }

  function closeSignal() {
    const controller = new AbortController();
    $('dialog').addEventListener('close', () => controller.abort(), { once: true });
    return controller.signal;
  }

  function setTiming(event, timing) {
    const index = event.timings.findIndex(item => item.programId === timing.programId);
    if (index === -1) event.timings.push(timing);
    else event.timings[index] = timing;
  }

  function recordTime(programId, starting) {
    const event = current();
    const timing = timingFor(event, programId);
    const program = event.programs.find(item => item.id === programId);
    const running = event.timings.find(item => item.status === '進行中' && item.programId !== programId);
    if (starting && running && !window.confirm(`「${event.programs.find(item => item.id === running.programId).name}」を終了し、「${program.name}」を開始しますか？`)) return;
    if (starting && timing.status !== '開始前' || !starting && timing.status !== '進行中') throw new Error('プログラムの状態を確認してください。');
    const now = stamp();
    commit(draft => {
      if (starting && running) setTiming(draft, { ...running, status: '終了', end: now });
      setTiming(draft, starting ? { ...timing, status: '進行中', start: now } : { ...timing, status: '終了', end: now });
    });
    notify(`${program.name}の${starting ? '開始' : '終了'}時刻を保存しました。`);
  }

  function timingDialog(programId, cancel = false) {
    const event = current();
    const program = event.programs.find(item => item.id === programId);
    const previous = timingFor(event, programId);
    const reason = field(cancel ? '中止理由' : '修正理由', '<textarea name="reason" maxlength="1000" required></textarea>');
    openDialog(`${program.name} ${cancel ? '中止' : '時刻修正'}`, cancel ? reason :
      field('状態', `<select name="status">${STATES.map(status => option(status, previous.status)).join('')}</select>`) +
      field('開始時刻（日本時間）', input('start', 'datetime-local', fieldValue(previous.start), 'step="1"')) +
      field('終了時刻（日本時間）', input('end', 'datetime-local', fieldValue(previous.end), 'step="1"')) + reason, data => {
        const comment = String(data.get('reason')).trim();
        if (!comment) throw new Error('理由を入力してください。');
        const status = cancel ? '中止' : data.get('status');
        const start = cancel ? previous.start : data.get('start') && M.fromJst(data.get('start'));
        const end = cancel ? previous.start && stamp() : data.get('end') && M.fromJst(data.get('end'));
        commit(draft => {
          setTiming(draft, { programId, status, start, end, reason: status === '中止' ? comment : '' });
          history(draft, `${program.name} ${cancel ? '中止' : '時刻修正'}。変更前 ${previous.status} ${time(previous.start)}〜${time(previous.end)}。変更後 ${status} ${time(start)}〜${time(end)}`, comment);
        });
      });
  }

  function importSheetsDialog() {
    const csvFile = name => input(name, 'file', '', 'accept=".csv,text/csv"' + (/^(programs|rules)$/.test(name) ? ' required' : ''));
    openDialog('設定CSVを読み込む', '<p>現在のGoogleスプレッドシートで各シートを開き、「ファイル → ダウンロード → CSV（現在のシート）」で保存します。設定を取り込んだ大会を新しく追加します。</p>' +
      field('配点', csvFile('rules')) + field('プログラム', csvFile('programs')) + field('徒競走設定（徒競走がある場合）', csvFile('races')) + field('設定（任意）', csvFile('settings')), async data => {
        const files = {};
        for (const [name, file] of data) if (file?.size) files[name] = await readFile(file);
        if (!files.programs || !files.rules) throw new Error('「配点」と「プログラム」のCSVを選んでください。');
        commit((previous, next) => {
          const imported = M.importSheets(previous, files);
          next.events.push(imported);
          next.active = imported.id;
        });
      }, [{ value: 'import', label: '読み込んで新しい大会を作る', primary: true }]);
  }

  function readFile(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('読み込むファイルを5MB以内にしてください。');
    return file.text();
  }

  function backup() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `運動会バックアップ-${M.dateTime(stamp()).slice(0, 10)}.json`;
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function restoreDialog() {
    openDialog('バックアップを読み込む', '<p>このアプリで保存したファイルを選ぶと、大会が別の記録として追加されます。</p>' + field('バックアップファイル', input('file', 'file', '', 'accept=".json,application/json" required')), async data => {
      let restored;
      const raw = await readFile(data.get('file'));
      try { restored = M.validateStore(JSON.parse(raw)); }
      catch (error) { throw new Error('バックアップを読み込めません。' + error.message); }
      commit((_, next) => {
        restored.events.forEach(event => {
          const restoredEvent = { ...event, id: M.id(), name: `${event.name.slice(0, 144)}（復元）` };
          next.events.push(restoredEvent);
          if (event.id === restored.active) next.active = restoredEvent.id;
        });
      });
    }, [{ value: 'restore', label: '別の大会として追加', primary: true }]);
  }

  function move(id, offset) {
    commit(event => {
      const index = event.programs.findIndex(program => program.id === id);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= event.programs.length) return;
      const [program] = event.programs.splice(index, 1);
      event.programs.splice(destination, 0, program);
    });
  }

  const actions = {
    'event-edit': () => eventDialog(false), 'event-copy': () => eventDialog(true),
    'import-sheets': importSheetsDialog, 'rule-add': () => ruleDialog(''), 'rule-edit': ruleDialog,
    'program-add': () => programDialog(''), 'program-edit': programDialog,
    'move-up': id => move(id, -1), 'move-down': id => move(id, 1),
    'program-delete': id => {
      if (!confirm('このプログラムを削除しますか？')) return;
      commit(event => {
        if (hasResults(event, id) || event.timings.some(item => item.programId === id)) throw new Error('記録のあるプログラムは削除できません。');
        event.programs = event.programs.filter(program => program.id !== id);
      });
      $('dialog').close();
    },
    score: scoreDialog, start: id => recordTime(id, true), finish: id => recordTime(id, false),
    timing: id => timingDialog(id), 'cancel-program': id => timingDialog(id, true),
    report: () => { if (!reportBlockers(current()).length) show('report'); },
    print: () => window.print(), backup, restore: restoreDialog,
    close: () => { if (!$('dialog-form').dataset.busy) $('dialog').close(); }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    try {
      if (button.dataset.view) show(button.dataset.view);
      else if (button.dataset.action) actions[button.dataset.action]?.(button.dataset.id);
    } catch (error) {
      if ($('dialog').open) failDialog(error);
      else notify(error.message);
    }
  });
  $('dialog').addEventListener('cancel', event => { if ($('dialog-form').dataset.busy) event.preventDefault(); });
  $('drafts').addEventListener('change', render);
  $('event-picker').addEventListener('change', event => {
    try { commit((_, next) => { next.active = event.target.value; }); }
    catch (error) { render(); notify(error.message); }
  });

  async function prepareOffline() {
    const status = $('offline-status');
    if (location.protocol === 'file:') { status.textContent = 'ローカルファイルで起動中'; return; }
    if (!('serviceWorker' in navigator)) { status.textContent = 'オフラインでの開き直しは未準備'; return; }
    const refresh = () => {
      if (navigator.serviceWorker.controller) status.textContent = navigator.onLine ? 'オフライン起動の準備済み' : 'オフラインで使用中';
    };
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    refresh();
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      refresh();
      if (!navigator.serviceWorker.controller) status.textContent = 'オフライン準備中。オンラインで一度開き直してください。';
    } catch { if (!navigator.serviceWorker.controller) status.textContent = 'オフライン起動を準備できませんでした'; }
  }

  start();
})();
