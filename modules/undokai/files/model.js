(function (root) {
  'use strict';

  const TYPE = { NONE: '得点なし', SPRINT: '徒競走', GROUP: '団体競技', RELAY: 'リレー' };
  const RELAY = ['赤', '黄', '白', '青'];
  const OUTCOME = ['赤勝利', '白勝利', '引き分け'];
  const GRADES = ['1年', '2年', '3年', '4年', '5年', '6年'];
  const STATES = ['開始前', '進行中', '終了', '中止'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const jst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const dateTime = value => value ? jst.format(new Date(value)) : '';
  const fromJst = value => new Date(value + '+09:00').toISOString();
  const key = (programId, grade = '', race = 1) => JSON.stringify([programId, grade, race]);

  function grades(target) {
    const value = String(target).normalize('NFKC').replace(/\s/g, '');
    if (value === '低学年') return GRADES.slice(0, 2);
    if (value === '中学年') return GRADES.slice(2, 4);
    if (value === '高学年') return GRADES.slice(4);
    const match = /^([1-6])年(?:生)?$/.exec(value);
    return match ? [match[1] + '年'] : [];
  }

  function defaultRules() {
    return [
      { id: 'RACE6', name: '徒競走 標準', type: TYPE.SPRINT, points: [6, 5, 4, 3, 2, 1] },
      { id: 'GROUP10', name: '団体競技 標準', type: TYPE.GROUP, points: [10, 0, 0, 10, 5, 5] },
      { id: 'RELAY4', name: 'リレー 標準', type: TYPE.RELAY, points: [4, 3, 2, 1] }
    ];
  }

  function createEvent() {
    const programs = [
      ['P001', '開会式', TYPE.NONE, '全校', '', {}],
      ['P002', '低学年 徒競走', TYPE.SPRINT, '低学年', 'RACE6', { '1年': 2, '2年': 2 }],
      ['P003', '低学年 団体競技', TYPE.GROUP, '低学年', 'GROUP10', {}],
      ['P004', '全校リレー', TYPE.RELAY, '全校', 'RELAY4', {}],
      ['P005', '閉会式', TYPE.NONE, '全校', '', {}]
    ].map(([id, name, type, target, ruleId, counts]) => ({ id, name, type, target, ruleId, counts, note: '' }));
    return { id: id(), name: '運動会', school: '', date: '', programs, rules: defaultRules(), results: [], timings: [], history: [] };
  }

  function unitList(program) {
    if (program.type === TYPE.NONE) return [];
    if (program.type !== TYPE.SPRINT) return [{ grade: '', race: 1, label: '競技結果' }];
    return grades(program.target).flatMap(grade => Array.from({ length: program.counts[grade] }, (_, index) => ({
      grade, race: index + 1, label: `${grade} 第${index + 1}レース`
    })));
  }

  function resultKey(result) { return key(result.programId, result.grade, result.race); }

  function score(rule, input) {
    if (rule.type === TYPE.GROUP) {
      const position = OUTCOME.indexOf(input);
      if (position === -1) throw new Error('勝敗を選んでください。');
      return [rule.points[position * 2], rule.points[position * 2 + 1]];
    }
    if (rule.type === TYPE.SPRINT) {
      if (!Array.isArray(input) || input.length < 1 || input.length > 6 || input.some(team => !['赤', '白'].includes(team))) {
        throw new Error('1着から順に、出走した人数分の組色を選んでください。');
      }
    } else if (!Array.isArray(input) || input.length !== 4 || new Set(input).size !== 4 || input.some(team => !RELAY.includes(team))) {
      throw new Error('1着から4着まで、各チームを1回ずつ選んでください。');
    }
    const points = [0, 0];
    input.forEach((team, index) => {
      const value = rule.points[index];
      if (value === null) throw new Error(`${index + 1}着の配点が未設定です。「設定」で配点を入力してください。`);
      points[team === '赤' || team === '黄' ? 0 : 1] += value;
    });
    return points;
  }

  function totals(event, includeDraft = false, programId = '', grade = '') {
    const canceled = new Set(event.timings.filter(timing => timing.status === '中止').map(timing => timing.programId));
    const programs = new Map(event.programs.map(program => [program.id, program]));
    const rules = new Map(event.rules.map(rule => [rule.id, rule]));
    return event.results.reduce((sum, result) => {
      if (canceled.has(result.programId) || (!includeDraft && !result.confirmed)) return sum;
      if (programId && result.programId !== programId || grade && result.grade !== grade) return sum;
      const [red, white] = score(rules.get(programs.get(result.programId).ruleId), result.input);
      return [sum[0] + red, sum[1] + white];
    }, [0, 0]);
  }

  function requireValue(ok, message) { if (!ok) throw new Error(message); }
  function str(value, max = 300) { return typeof value === 'string' && value.length <= max; }
  function filled(value, max) { return str(value, max) && value.trim().length > 0; }
  function iso(value) { return str(value, 40) && Number.isFinite(Date.parse(value)); }

  function validateEvent(event) {
    const error = '大会データの形式を確認してください。';
    requireValue(event && filled(event.id, 150) && filled(event.name, 150) && str(event.school, 150) && str(event.date, 10), error);
    requireValue(!event.date || /^\d{4}-\d{2}-\d{2}$/.test(event.date) && iso(event.date), '開催日の形式が正しくありません。');
    requireValue(['programs', 'rules', 'results', 'timings', 'history'].every(field => Array.isArray(event[field])), error);
    const rules = new Map();
    event.rules.forEach(rule => {
      requireValue(rule && filled(rule.id, 150) && filled(rule.name, 150) && !rules.has(rule.id), '配点の名前やIDが重複していないか確認してください。');
      const validPoints = value => (rule.type !== TYPE.GROUP && value === null) || (typeof value === 'number' && Number.isFinite(value));
      requireValue([TYPE.SPRINT, TYPE.GROUP, TYPE.RELAY].includes(rule.type) && Array.isArray(rule.points) && rule.points.length === (rule.type === TYPE.RELAY ? 4 : 6) && rule.points.every(validPoints), `${rule.name}の配点を数値で入力してください。`);
      rules.set(rule.id, rule);
    });
    const programs = new Map();
    const units = new Set();
    event.programs.forEach(program => {
      requireValue(program && filled(program.id, 150) && filled(program.name, 150) && str(program.target, 150) && str(program.note, 1000) && !programs.has(program.id), 'プログラムの名前やIDを確認してください。');
      requireValue(Object.values(TYPE).includes(program.type), `${program.name}の種別を確認してください。`);
      if (program.type !== TYPE.NONE) requireValue(rules.get(program.ruleId)?.type === program.type, `${program.name}に使う配点を確認してください。`);
      if (program.type === TYPE.SPRINT) {
        const groups = grades(program.target);
        requireValue(groups.length > 0 && program.counts && groups.every(grade => Number.isInteger(program.counts[grade]) && program.counts[grade] >= 1 && program.counts[grade] <= 99), `${program.name}の対象学年とレース数（1〜99）を確認してください。`);
      }
      programs.set(program.id, program);
      unitList(program).forEach(unit => units.add(key(program.id, unit.grade, unit.race)));
    });
    const recorded = new Set();
    event.results.forEach(result => {
      requireValue(result && typeof result.confirmed === 'boolean' && units.has(resultKey(result)) && !recorded.has(resultKey(result)), '入力済みの得点とプログラムの学年・レース数が一致しません。');
      score(rules.get(programs.get(result.programId).ruleId), result.input);
      recorded.add(resultKey(result));
    });
    const timed = new Set();
    let running = 0;
    event.timings.forEach(timing => {
      requireValue(timing && programs.has(timing.programId) && !timed.has(timing.programId) && STATES.includes(timing.status) && str(timing.reason, 1000), '計時の記録を確認してください。');
      requireValue((timing.start === '' || iso(timing.start)) && (timing.end === '' || iso(timing.end)), '開始時刻と終了時刻を確認してください。');
      if (timing.start && timing.end) requireValue(Date.parse(timing.start) <= Date.parse(timing.end), '終了時刻を開始時刻以降にしてください。');
      if (timing.status === '開始前') requireValue(!timing.start && !timing.end, '開始前の時刻欄は空にしてください。');
      if (timing.status === '進行中') {
        requireValue(timing.start && !timing.end, '進行中は開始時刻だけを入力してください。');
        running++;
      }
      if (timing.status === '終了') requireValue(timing.start && timing.end, '開始時刻と終了時刻を入力してください。');
      if (timing.status === '中止') requireValue(filled(timing.reason, 1000), '中止理由を入力してください。');
      timed.add(timing.programId);
    });
    requireValue(running <= 1, '進行中のプログラムを一つにしてください。');
    event.history.forEach(item => requireValue(item && iso(item.at) && str(item.label, 1000) && str(item.reason, 1000), '変更履歴の形式を確認してください。'));
    return event;
  }

  function validateStore(store) {
    requireValue(store?.version === 1 && Array.isArray(store.events) && store.events.length > 0, '運動会アプリのバックアップファイルを選んでください。');
    const ids = new Set();
    store.events.forEach(event => {
      validateEvent(event);
      requireValue(!ids.has(event.id), '大会のIDが重複しています。');
      ids.add(event.id);
    });
    requireValue(ids.has(store.active), '開く大会が指定されていません。');
    return store;
  }

  function csv(text) {
    const value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (quoted && char === '"' && value[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted && char === '"') quoted = false;
      else if (quoted) cell += char;
      else if (char === '"' && cell === '') quoted = true;
      else if (char === ',' || char === '\n') {
        row.push(cell);
        cell = '';
        if (char === '\n') { rows.push(row); row = []; }
      } else cell += char;
    }
    requireValue(!quoted, 'CSVファイルの引用符を確認してください。');
    rows.push([...row, cell]);
    return rows.filter(item => item.some(cell => cell.trim()));
  }

  function readCsv(text, required, label) {
    const [header = [], ...rows] = csv(text);
    const names = header.map(value => value.trim());
    requireValue(required.every(name => names.includes(name)), `「${label}」シートから書き出したCSVを選んでください。`);
    return rows.map(row => Object.fromEntries(names.map((name, i) => [name, (row[i] || '').trim()])));
  }

  function importSheets(current, files) {
    const rankFields = ['1位', '2位', '3位', '4位', '5位', '6位'];
    const groupFields = ['赤勝利時_赤', '赤勝利時_白', '白勝利時_赤', '白勝利時_白', '引分時_赤', '引分時_白'];
    const ruleRows = readCsv(files.rules, ['配点ID', '種別', ...rankFields, ...groupFields], '配点');
    const rules = ruleRows.filter(row => row.配点ID).map(row => {
      const fields = row.種別 === TYPE.GROUP ? groupFields : row.種別 === TYPE.RELAY ? rankFields.slice(0, 4) : rankFields;
      return { id: row.配点ID, name: row.配点ID, type: row.種別, points: fields.map(field => row[field] === '' && row.種別 !== TYPE.GROUP ? null : Number(row[field])) };
    });
    const programRows = readCsv(files.programs, ['プログラムID', '実施順', '名称', '種別', '対象学年・区分', '配点ID', '使用'], 'プログラム');
    const active = value => /^(true|1|はい|使用|有効)$/i.test(value);
    const raceRows = files.races ? readCsv(files.races, ['プログラムID', '学年', 'レース数', '使用'], '徒競走設定') : [];
    const programs = programRows.filter(row => row.プログラムID && active(row.使用)).sort((a, b) => Number(a.実施順) - Number(b.実施順) || a.プログラムID.localeCompare(b.プログラムID, 'ja')).map(row => {
      const counts = {};
      if (row.種別 === TYPE.SPRINT) grades(row['対象学年・区分']).forEach(grade => {
        const matches = raceRows.filter(race => race.プログラムID === row.プログラムID && grades(race.学年).length === 1 && grades(race.学年)[0] === grade && active(race.使用));
        requireValue(matches.length === 1, `${row.名称} ${grade}のレース数を「徒競走設定」CSVで確認してください。`);
        counts[grade] = Number(matches[0].レース数);
      });
      return { id: row.プログラムID, name: row.名称, type: row.種別, target: row['対象学年・区分'], ruleId: row.配点ID, counts, note: row.備考 || '' };
    });
    requireValue(programs.length, '「プログラム」CSVに使用する競技がありません。');
    const event = { ...current, id: id(), programs, rules, results: [], timings: [], history: [] };
    if (files.settings) {
      const settings = new Map(readCsv(files.settings, ['項目', '設定値'], '設定').map(row => [row.項目, row.設定値]));
      event.name = settings.get('大会名') || event.name;
      event.school = settings.get('学校名') || '';
      const date = (settings.get('開催日') || '').normalize('NFKC');
      const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(date);
      requireValue(!date || match, '「設定」CSVの開催日を西暦（例 2027/10/3）にしてください。');
      event.date = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    }
    return validateEvent(event);
  }

  root.Undokai = { TYPE, RELAY, OUTCOME, GRADES, STATES, clone, id, dateTime, fromJst, key, grades, defaultRules, createEvent, unitList, resultKey, score, totals, validateEvent, validateStore, importSheets };
})(globalThis);
