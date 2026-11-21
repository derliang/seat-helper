// 分組功能介面層測試（jsdom）。執行：node --test tests/
// 需要 jsdom：沒有就跳過。安裝（不進 repo）：npm install --no-save jsdom；或設環境變數 JSDOM_PATH 指到 jsdom 資料夾。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

let JSDOM, VirtualConsole;
try {
    ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom'));
} catch (e) {
    JSDOM = null;
}
const skip = JSDOM ? false : '沒有安裝 jsdom（npm install --no-save jsdom），跳過介面互動測試';

const NAMES = '王小明 李小華 張小美 陳大文 林小安 黃志豪 吳雅婷 劉冠宇 蔡佳穎 楊承恩 許婉如 鄭宇軒 謝語彤 郭柏翰 洪慧君 曾思穎 邱品睿 廖若涵 賴冠廷 徐子晴 周柏宇 葉芷瑄 蘇冠霖 莊雅涵 江承翰 呂欣怡 何宥辰 蕭語嫣 羅子豪 高苡安 潘柏廷 簡妤潔'.split(' ');
const score = i => 50 + ((i * i * 5 + i * 17 + 3) % 49);
const pasteFull = NAMES.map((n, i) => ['3A', i + 1, n, score(i)].join('\t')).join('\n');

async function loadApp(file) {
    const html = fs.readFileSync(path.join(ROOT, file || 'index.html'), 'utf8');
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { const m = String((e && e.message) || e); if (!/Could not load script|Not implemented|net::|ERR_/.test(m)) errors.push(m); });
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', url: 'http://localhost/index.html', virtualConsole: vc, pretendToBeVisual: true,
        beforeParse(w) {
            w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
            w.scrollTo = () => {};
            w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        }
    });
    const w = dom.window, d = w.document;
    await new Promise(r => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });
    const saved = [];
    w.downloadBlob = (blob, name) => saved.push({ blob, name });
    const q = sel => d.querySelector('#groupView ' + sel);
    const qa = sel => Array.from(d.querySelectorAll('#groupView ' + sel));
    const click = el => { if (typeof el === 'string') el = q(el); assert.ok(el, '找不到元素'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
    const act = (a, v, k) => click('[data-a="' + a + '"]' + (v != null ? '[data-v="' + v + '"]' : '') + (k != null ? '[data-k="' + k + '"]' : ''));
    const type = (sel, value) => { const el = q(sel); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const toggle = (sel, on) => { const el = q(sel); el.checked = on; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const U = w.GroupUI;
    return { w, d, q, qa, click, act, type, toggle, U, S: U && U.state, errors, saved };
}
const plain = x => JSON.parse(JSON.stringify(x));
const group = (app, text) => { app.U.setMode('group'); app.type('#gvPaste', text); };
const bytesOf = (app, blob) => new Promise((res, rej) => { const fr = new app.w.FileReader(); fr.onload = () => res(new Uint8Array(fr.result)); fr.onerror = rej; fr.readAsArrayBuffer(blob); });
const tick = ms => new Promise(r => setTimeout(r, ms));

test('載入頁面沒有錯誤，預設在「排座位」，分組頁籤可切換', { skip }, async () => {
    const a = await loadApp();
    assert.deepEqual(a.errors, []);
    assert.equal(a.d.getElementById('groupView').parentElement.id, 'mainView', '分組畫面在主畫面裡（後台開啟時會一起收起）');
    assert.equal(a.d.body.getAttribute('data-mode'), null);
    assert.equal(a.d.getElementById('modeTabSeat').getAttribute('aria-selected'), 'true');
    a.d.getElementById('modeTabGroup').click();
    assert.equal(a.d.body.getAttribute('data-mode'), 'group');
    assert.equal(a.d.getElementById('modeTabGroup').getAttribute('aria-selected'), 'true');
    assert.ok(a.q('.gsteps'));
    a.d.getElementById('modeTabSeat').click();
    assert.equal(a.d.body.getAttribute('data-mode'), 'seat');
    assert.ok(a.d.querySelector('#mainView > .main'), '排座位主畫面還在');
});

test('貼上名單：自動判斷欄位、略過標題列、自動加座號', { skip }, async () => {
    const a = await loadApp();
    group(a, pasteFull);
    assert.deepEqual(plain(a.S.parsed.types), ['cls', 'no', 'name', 'score']);
    assert.equal(a.S.roster.length, 32);
    assert.equal(a.S.roster[0].name, '王小明');
    assert.equal(a.S.roster[0].score, score(0));
    assert.match(a.q('#gvPreview').textContent, /共 32 人/);
    // 只有姓名＋自動加座號
    a.type('#gvPaste', '王小明\n李小華\n張小美');
    assert.deepEqual(plain(a.S.parsed.types), ['name']);
    assert.deepEqual(plain(a.S.roster.map(r => r.no)), ['1', '2', '3']);
    a.toggle('[data-a="autono"]', false);
    assert.deepEqual(plain(a.S.roster.map(r => r.no)), ['', '', '']);
    // 有標題列
    a.type('#gvPaste', '班級\t座號\t姓名\t成績\n3A\t1\t王小明\t86\n3A\t2\t李小華\t');
    assert.equal(a.S.parsed.hdr, true);
    assert.equal(a.S.roster.length, 2);
    assert.equal(a.S.roster[1].score, '');
    assert.match(a.q('#gvPreview').textContent, /缺成績 1 人/);
});

test('欄位判斷錯了可以在表頭改；同一種欄位只留一欄', { skip }, async () => {
    const a = await loadApp();
    group(a, '3A\t1\t王小明\t86\n3A\t2\t李小華\t79');
    const sel = a.q('select[data-i="3"]');
    sel.value = 'skip'; sel.dispatchEvent(new a.w.Event('change', { bubbles: true }));
    assert.equal(a.S.roster[0].score, '');
    const sel0 = a.q('select[data-i="0"]');
    sel0.value = 'name'; sel0.dispatchEvent(new a.w.Event('change', { bubbles: true }));
    assert.deepEqual(plain(a.S.parsed.types), ['name', 'no', 'skip', 'skip']);
});

test('逐筆輸入與清除名單（要先確認）', { skip }, async () => {
    const a = await loadApp();
    a.U.setMode('group');
    a.act('src', 'hand');
    a.type('[data-in="hand"][data-i="0"][data-f="name"]', '王小明');
    a.type('[data-in="hand"][data-i="0"][data-f="score"]', '86');
    a.type('[data-in="hand"][data-i="1"][data-f="name"]', '李小華');
    assert.equal(a.S.roster.length, 2);
    assert.equal(a.S.roster[0].score, 86);
    a.act('clear');
    assert.equal(a.S.roster.length, 2, '按一下只是要求確認');
    assert.ok(a.q('[data-a="clearyes"]'));
    a.act('clearyes');
    assert.equal(a.S.roster.length, 0);
});

test('名單裡的特殊字元會被轉成純文字', { skip }, async () => {
    const a = await loadApp();
    group(a, '<img src=x onerror=alert(1)>\t86\n李小華\t79');
    assert.equal(a.q('#gvPreview img'), null);
    assert.ok(a.q('#gvPreview').textContent.includes('<img'));
});

test('隨機分組：組數、每組人數、結果頁與分組紀錄', { skip }, async () => {
    const a = await loadApp();
    group(a, pasteFull);
    a.act('next1');
    assert.equal(a.S.step, 2);
    assert.match(a.q('#gvSizeHint').textContent, /32 人 → 8 組，每組 4 人（剛好整除）/);
    a.act('num', '1'); // 9 組：前 5 組 4 人、其餘 3 人
    assert.match(a.q('#gvSizeHint').textContent, /32 人 → 9 組/);
    a.act('by', 'size'); // 每組 9 人 → 4 組
    assert.match(a.q('#gvSizeHint').textContent, /→ 4 組/);
    a.act('start');
    assert.equal(a.S.step, 3);
    const sizes = a.S.groups.map(g => g.length);
    assert.ok(Math.max(...sizes) <= 9 && sizes.length === 4, '每組最多 9 人、共 4 組：' + sizes);
    assert.equal(a.S.groups.flat().length, 32);
    assert.equal(a.S.recs.length, 1);
    assert.equal(a.qa('.gcard').length, a.S.groups.length);
    // 再分組 12 次，紀錄最多 10 筆
    for (let i = 0; i < 12; i++) a.act('regroup');
    assert.equal(a.S.recs.length, 10);
    assert.equal(a.qa('.ghist li').length >= 10, true);
});

test('避免與上次同組：比對上次的分組，做得到就完全避開', { skip }, async () => {
    const a = await loadApp();
    group(a, pasteFull);
    a.act('next1'); a.act('start');
    const first = JSON.stringify(a.S.groups.map(g => g.map(i => a.S.gRoster[i].name)));
    a.act('regroup');
    const prev = a.S.recs[1];
    const pairs = new Set();
    prev.groups.forEach(g => g.forEach(x => g.forEach(y => { if (x < y) pairs.add(x + ',' + y); })));
    const rep = a.S.groups.reduce((n, g) => { let c = 0; g.forEach(x => g.forEach(y => { if (x < y && pairs.has(x + ',' + y)) c++; })); return n + c; }, 0);
    assert.equal(rep, 0, '做得到時完全不與上次同組');
    assert.match(a.q('aside').textContent, /沒有重複/);
    assert.notEqual(first, undefined);
});

test('按成績分組：缺成績要補或略過，補齊才能開始', { skip }, async () => {
    const a = await loadApp();
    const lines = NAMES.map((n, i) => ['3A', i + 1, n, i === 5 || i === 14 ? '' : score(i)].join('\t')).join('\n');
    group(a, lines);
    a.act('next1'); a.act('meth', 'score');
    assert.ok(a.q('#gvMiss'), '出現補成績區');
    assert.equal(a.q('#gvStart [data-a="start"]').getAttribute('aria-disabled'), 'true');
    a.act('start');
    assert.equal(a.S.step, 2, '還不能開始');
    a.type('input[data-in="fix"][data-i="5"]', '70');
    assert.equal(a.q('#gvStart [data-a="start"]').getAttribute('aria-disabled'), 'true', '還缺一位');
    a.type('input[data-in="fix"][data-i="14"]', '88.5');
    assert.equal(a.q('#gvStart [data-a="start"]').getAttribute('aria-disabled'), 'false');
    assert.ok(a.q('#gvMiss').classList.contains('ok'));
    a.act('start');
    assert.equal(a.S.step, 3);
    assert.equal(a.S.groups.flat().length, 32);
    assert.equal(a.S.gRoster[14].score, 88.5);
    assert.match(a.q('.gcards').textContent, /平均/);
    assert.ok(a.q('aside .bars'), '右欄有各組平均');
});

test('按成績分組：略過缺成績的人', { skip }, async () => {
    const a = await loadApp();
    const lines = NAMES.map((n, i) => ['3A', i + 1, n, i < 3 ? '' : score(i)].join('\t')).join('\n');
    group(a, lines);
    a.act('next1'); a.act('meth', 'score');
    toggle(a);
    function toggle(app) { app.toggle('[data-a="skip"]', true); }
    a.act('start');
    assert.equal(a.S.step, 3);
    assert.equal(a.S.groups.flat().length, 29);
    assert.match(a.q('#gvResult').textContent, /3 位沒有成績的同學已略過/);
});

test('名單沒有成績：不顯示成績與各組平均，下載卡只說明一頁', { skip }, async () => {
    const a = await loadApp();
    group(a, NAMES.join('\n'));
    a.act('next1'); a.act('start');
    assert.equal(a.q('aside .bars'), null);
    assert.equal(a.q('#gvResult .gsw'), null, '沒有「顯示成績」開關');
    assert.match(a.q('[data-dl="group"]').textContent, /只會下載一頁（不含成績）/);
    assert.equal(a.q('[data-dl="group"] .opt'), null);
});

async function grouped() {
    const a = await loadApp();
    group(a, pasteFull);
    a.act('next1'); a.act('meth', 'score'); a.act('start');
    return a;
}

test('點兩位同學互換、復原、重做、跳到某一步、一次還原', { skip }, async () => {
    const a = await grouped();
    const before = JSON.stringify(a.S.groups);
    const pick = (g, k) => a.click('.gcard [data-s="' + g + ',' + k + '"]');
    const n0 = a.S.gRoster[a.S.groups[0][0]].name, n1 = a.S.gRoster[a.S.groups[1][0]].name;
    pick(0, 0);
    pick(1, 0);
    assert.equal(a.S.gRoster[a.S.groups[0][0]].name, n1);
    assert.equal(a.S.gRoster[a.S.groups[1][0]].name, n0);
    assert.equal(a.S.hist.length, 2);
    assert.match(a.q('[data-adj]').textContent, /已手動調整 2 人/);
    a.act('next2');
    assert.match(a.q('[data-members]').textContent, /已手動調整 2 人/);
    a.act('res', 'result');
    pick(2, 1); pick(3, 2);
    assert.equal(a.S.hi, 2);
    a.act('next2');
    a.act('undo');
    assert.equal(a.S.hi, 1);
    a.act('redo');
    assert.equal(a.S.hi, 2);
    a.act('jump', '0');
    assert.equal(JSON.stringify(a.S.groups), before);
    a.act('jump', '2');
    // 退回某步後再調整，後面的重做步驟捨棄
    a.act('jump', '1'); a.act('res', 'result'); pick(4, 0); pick(5, 0);
    assert.equal(a.S.hist.length, 3);
    // 還原人工調整：先確認，這一步也能復原
    a.act('res', 'seat');
    a.act('restore');
    assert.ok(a.q('[data-a="restoreyes"]'));
    a.act('restoreno');
    a.act('restore'); a.act('restoreyes');
    assert.equal(JSON.stringify(a.S.groups), before);
    a.act('undo');
    assert.notEqual(JSON.stringify(a.S.groups), before);
});

test('調整紀錄最多保留 50 步', { skip }, async () => {
    const a = await grouped();
    for (let i = 0; i < 60; i++) { a.click('.gcard [data-s="0,0"]'); a.click('.gcard [data-s="1,0"]'); }
    assert.equal(a.S.hist.length, 51);
    assert.equal(a.S.hi, 50);
    a.act('next2');
    assert.match(a.q('[data-members]').textContent, /復原（50 步）/);
});

test('座位安排：傳統座位的設定與換人、不排、座位不夠', { skip }, async () => {
    const a = await grouped();
    a.act('next2');
    assert.equal(a.S.res, 'seat');
    assert.ok(a.q('.seatgrid'));
    assert.equal(a.qa('.gcell[data-s]').length, 32, '32 人 32 個有人的座位（8 組 4 人 2×2 方塊）');
    // 換人：座位與組別一起換
    const cells = a.qa('.gcell[data-s]');
    const s0 = cells[0].getAttribute('data-s'), s1 = cells[5].getAttribute('data-s');
    const [g0, k0] = s0.split(',').map(Number), [g1, k1] = s1.split(',').map(Number);
    const n0 = a.S.groups[g0][k0], n1 = a.S.groups[g1][k1];
    a.click(cells[0]); a.click(a.qa('.gcell[data-s="' + s1 + '"]')[0]);
    assert.equal(a.S.groups[g0][k0], n1);
    assert.equal(a.S.groups[g1][k1], n0);
    // 設為不排
    a.act('tool', 'off');
    const empty = a.qa('.gcell[data-o]')[0];
    a.click(empty);
    assert.equal(Object.keys(a.S.trad.off).length, 1);
    assert.match(a.q('.gcfg').textContent, /還缺 1 個/);
    assert.equal(a.q('[data-dl="seat"] .fbtn').getAttribute('aria-disabled'), 'true');
    assert.match(a.q('[data-dl="seat"]').textContent, /座位還缺 1 個/);
    a.act('tool', 'off');
    a.click(a.qa('.gcell.off')[0]);
    assert.equal(Object.keys(a.S.trad.off).length, 0);
    // 走道與排數
    a.act('tcols', '1');
    assert.equal(a.S.trad.cols, 9);
    a.act('tcols', '-1'); a.act('tcols', '-1');
    assert.equal(a.S.trad.cols, 7);
    assert.ok(a.S.trad.aisleAt <= 6);
    a.act('lay', 'row');
    assert.equal(a.S.trad.layout, 'row');
});

test('組數多、座位不夠坐時，傳統座位會自動加排數', { skip }, async () => {
    const a = await loadApp();
    group(a, NAMES.concat(NAMES).map((n, i) => n + i).join('\n'));
    a.act('next1');
    for (let i = 0; i < 4; i++) a.act('num', '1'); // 64 人 → 20 組
    a.act('start');
    const m = a.S.groups.length;
    a.act('next2');
    assert.ok(a.S.trad.cols * a.S.trad.depth >= 2 * Math.ceil(Math.max(...a.S.groups.map(g => g.length)) / 2) * m || a.S.trad.cols === 12);
    assert.ok(m >= 2);
});

test('座位安排：分組座位（桌子畫布）可換桌型、數量，座位不夠會警示', { skip }, async () => {
    const a = await grouped();
    a.act('next2'); a.act('smode', 'tbl');
    assert.ok(a.q('.canvas svg'));
    assert.equal(a.S.tbl.tables.length, 4, '32 人、每桌 8 人 → 4 張');
    assert.equal(a.qa('.canvas .sg').length, 32);
    a.act('preset', 'hex');
    assert.equal(a.S.tbl.tables.length, 6, '每桌 6 人 → 6 張（8 組×4 人＝32，6 桌 36 座）');
    a.act('ct', '-1', 'count');
    assert.match(a.q('[data-sum]').textContent, /還缺/);
    assert.equal(a.q('[data-dl="seat"] .fbtn').getAttribute('aria-disabled'), 'true');
    a.act('preset', 'island');
    assert.equal(a.S.tbl.tables.length, 8);
    // 換人
    const seats = a.qa('.canvas .sg');
    a.click(seats[0]); a.click(a.qa('.canvas .sg')[10]);
    assert.equal(a.S.hist.length, 2);
    // 選桌子、改座位數、複製、刪除
    a.click(a.q('.canvas .tg .t-rect'));
    a.act('pt', '1', 'n');
    a.act('pt', null, 'copy');
    assert.equal(a.S.tbl.tables.length, 9);
    a.act('pt', null, 'del');
    assert.equal(a.S.tbl.tables.length, 8);
});

test('下載分組名單：檔名、按鈕狀態與檔案內容', { skip }, async () => {
    const a = await grouped();
    const btn = a.q('[data-dl="group"] .fbtn[data-v="group:docx"]');
    assert.match(btn.textContent, /3A_分組名單_\d{4}-\d{2}-\d{2}\.docx/);
    a.click(btn);
    assert.equal(a.q('[data-dl="group"] .fbtn[data-v="group:docx"]').getAttribute('aria-busy'), 'true', '準備中');
    await tick(900);
    assert.equal(a.saved.length, 1);
    assert.match(a.saved[0].name, /^3A_分組名單_.*\.docx$/);
    const bytes = await bytesOf(a, a.saved[0].blob);
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
    assert.ok(a.q('[data-dl="group"] .fbtn.done'));
    assert.match(a.q('[data-dl="group"]').textContent, /再下載一次/);
    assert.match(a.q('[data-dl="group"]').textContent, /已存到瀏覽器的「下載」資料夾/);
    a.click(a.q('[data-dl="group"] .fbtn[data-v="group:xlsx"]'));
    await tick(900);
    assert.equal(a.saved.length, 2);
    assert.match(a.saved[1].name, /\.xlsx$/);
    assert.deepEqual(a.errors, []);
});

test('下載選項：含成績頁、不含成績頁至少開一頁，否則按鈕停用', { skip }, async () => {
    const a = await grouped();
    a.toggle('[data-v="pS"]', false);
    assert.equal(a.q('[data-dl="group"] .fbtn').getAttribute('aria-disabled'), null);
    a.toggle('[data-v="pN"]', false);
    assert.equal(a.q('[data-dl="group"] .fbtn').getAttribute('aria-disabled'), 'true');
    assert.match(a.q('[data-dl="group"]').textContent, /還沒選要下載哪一頁/);
    a.click(a.q('[data-dl="group"] .fbtn'));
    assert.equal(a.saved.length, 0);
});

test('下載座位表：傳統座位 Word／Excel；分組座位沒有圖也能下載', { skip }, async () => {
    const a = await grouped();
    a.act('next2');
    a.click(a.q('[data-dl="seat"] .fbtn[data-v="seat:docx"]'));
    await tick(900);
    a.click(a.q('[data-dl="seat"] .fbtn[data-v="seat:xlsx"]'));
    await tick(900);
    assert.equal(a.saved.length, 2);
    assert.match(a.saved[0].name, /座位表_.*\.docx$/);
    a.act('smode', 'tbl');
    a.click(a.q('[data-dl="seat"] .fbtn[data-v="seat:docx"]'));
    await tick(6200); // 轉圖逾時（jsdom 沒有畫布）後仍會產生檔案
    assert.equal(a.saved.length, 3);
    assert.equal(a.errors.length, 0);
});

test('名單有多個班級：檔名用「多班」；沒有班級：不加前綴', { skip }, async () => {
    const a = await loadApp();
    group(a, NAMES.slice(0, 8).map((n, i) => [i < 4 ? '3A' : '3B', i + 1, n, score(i)].join('\t')).join('\n'));
    a.act('next1'); a.act('start');
    assert.match(a.q('[data-dl="group"] .fbtn').textContent, /多班_分組名單_/);
    const b = await loadApp();
    group(b, NAMES.slice(0, 8).join('\n'));
    b.act('next1'); b.act('start');
    assert.match(b.q('[data-dl="group"] .fbtn').textContent, /分組名單_\d{4}/);
    assert.doesNotMatch(b.q('[data-dl="group"] .fbtn').textContent, /_分組名單_.*_分組名單/);
    assert.doesNotMatch(b.q('[data-dl="group"] .fbtn small').textContent, /^.+_分組名單_/);
});

test('載入舊的分組紀錄；重新整理後名單與紀錄還在', { skip }, async () => {
    const a = await grouped();
    const firstId = a.S.recId;
    a.act('regroup');
    assert.notEqual(a.S.recId, firstId);
    a.act('rec', firstId);
    assert.equal(a.S.recId, firstId);
    assert.equal(a.S.step, 3);
    assert.equal(a.S.hist.length, 1);
    // 同一個瀏覽器儲存空間再開一次
    const dump = a.w.localStorage.getItem('seatHelperGroupV1');
    assert.ok(dump && JSON.parse(dump).recs.length === 2);
});

test('手機寬度：steps、下載卡與座位都在同一欄（單欄版面由 CSS 控制，這裡確認結構完整）', { skip }, async () => {
    const a = await grouped();
    assert.ok(a.q('.gsteps'));
    assert.ok(a.q('.grid2'));
    a.act('next2');
    assert.ok(a.q('[data-members]') && a.q('[data-dl="seat"]'));
});

test('版號：APP_VERSION 與 README 最新一筆一致', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const v = html.match(/const APP_VERSION = "(v[\d.]+)"/)[1];
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.equal(readme.match(/^### \S+ (v[\d.]+) \(/m)[1], v);
});

test('兩份 HTML 相同，且分組畫面沒有寫死色碼', { skip: false }, () => {
    const a = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), b = fs.readFileSync(path.join(ROOT, 'seat_helper.html'), 'utf8');
    assert.equal(a, b);
    const css = a.match(/<style id="group-ui-style">([\s\S]*?)<\/style>/)[1];
    const tokensEnd = css.indexOf('.mode-tabs');
    const rest = css.slice(tokensEnd);
    assert.equal(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/.test(rest.replace(/#groupView/g, '')), false, '樣式區（token 以外）不寫死色碼');
    assert.equal(/oklch\(|color-mix\(/.test(css), false);
});
