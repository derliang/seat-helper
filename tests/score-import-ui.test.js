// 匯入成績檔畫面（DESIGN.md 10.1a）介面互動測試（jsdom）。執行：node --test tests/*.test.js
// 需要 jsdom 與 SheetJS（產生捏造的 .xlsx）：沒有就跳過。安裝（不進 repo）：npm install --no-save jsdom xlsx@0.18.5；或設 JSDOM_PATH、XLSX_PATH。
// 樣本全部是假名、假成績。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

let JSDOM, VirtualConsole, XLSX;
try { ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom')); } catch (e) { JSDOM = null; }
try { XLSX = require(process.env.XLSX_PATH || 'xlsx'); } catch (e) { XLSX = null; }
const skip = JSDOM && XLSX ? false : '沒有安裝 jsdom 或 xlsx（npm install --no-save jsdom xlsx@0.18.5），跳過匯入畫面測試';

const NAMES = '王小明 李小華 張小美 陳大文 林小安 黃志豪 吳雅婷 劉冠宇 蔡佳穎 楊承恩 許婉如 鄭宇軒'.split(' ');
const plain = x => JSON.parse(JSON.stringify(x));

async function loadApp() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { const m = String((e && e.message) || e); if (!/Could not load script|Not implemented|net::|ERR_/.test(m)) errors.push(m); });
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', url: 'http://localhost/index.html', virtualConsole: vc, pretendToBeVisual: true,
        beforeParse(w) {
            w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
            w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
            w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
            // 頁面平常從 cdnjs 載入；測試直接給（jsdom 的 ArrayBuffer 和 node 的不同，先轉成 Buffer）
            w.XLSX = Object.assign({}, XLSX, { read: (d, o) => XLSX.read(Buffer.from(d.buffer || d), Object.assign({}, o, { type: 'buffer' })) });
        }
    });
    const w = dom.window, d = w.document;
    await new Promise(r => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });
    const q = sel => d.querySelector('#groupView ' + sel);
    const qa = sel => Array.from(d.querySelectorAll('#groupView ' + sel));
    const click = el => { if (typeof el === 'string') el = q(el); assert.ok(el, '找不到元素'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
    const act = (a, v) => click('[data-a="' + a + '"]' + (v != null ? '[data-v="' + v + '"]' : ''));
    const change = (el, value) => { if (typeof el === 'string') el = q(el); assert.ok(el, '找不到元素'); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const U = w.GroupUI;
    const importBytes = async (bytes, name) => {
        U.importFile(new w.File([new w.Uint8Array(bytes)], name));
        for (let i = 0; i < 50 && !(U.state.imp && U.state.imp.name === name); i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(U.state.imp, '檔案沒有讀進來');
    };
    return { w, d, q, qa, click, act, change, U, S: U.state, errors, importBytes };
}

/* 捏造的成績檔：彙總表（兩班並排、組別欄、比重在欄名）＋一張重複的班級表＋隱藏列 */
function fakeBook() {
    const head = ['班級', '組別', '座號', '姓名', '一段30%', '二段30%', '學期成績'];
    const sum = [head.concat([null], head)];
    for (let i = 0; i < 6; i++) sum.push(['3A', 1 + (i % 3), i + 1, NAMES[i], i === 2 ? '缺' : 70 + i, 'A', 80 + i, null, '3B', 1 + (i % 3), i + 1, NAMES[6 + i], 60 + i, 'B', i === 4 ? '假' : 75 + i]);
    const ws = XLSX.utils.aoa_to_sheet(sum);
    ws['!rows'] = []; ws['!rows'][6] = { hidden: true };
    const cls = XLSX.utils.aoa_to_sheet([['座號', '姓名', '學期成績']].concat(NAMES.slice(0, 6).map((n, i) => [i + 1, n, 80 + i])));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '彙總');
    XLSX.utils.book_append_sheet(wb, cls, '3A');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }));
}

test('匯入 .xlsx：自動挑工作表、摘要列、上次分組、缺考小面板、警告區、下一步提示', { skip }, async () => {
    const a = await loadApp();
    a.U.setMode('group');
    a.act('src', 'file');
    assert.match(a.q('.dz').textContent, /會自動挑選名單所在的工作表，也可以自己選/);
    await a.importBytes(fakeBook(), '假成績.xlsx');
    assert.deepEqual(a.errors, []);
    // 工作表清單：彙總已選，3A 與它重複沒選
    const sheets = a.qa('#gvSheets .sheet');
    assert.equal(sheets.length, 2);
    assert.ok(sheets[0].classList.contains('on'));
    assert.match(sheets[1].textContent, /與「彙總」的人重複，沒有選/);
    // 隱藏列預設略過：第 7 列（3A 第 6 位、3B 第 6 位）
    assert.equal(a.S.roster.length, 10);
    assert.ok(a.q('[data-a="ihidden"]'));
    // 摘要列
    const sum = a.q('.sumrow').textContent;
    assert.match(sum, /讀取　彙總（共 2 個工作表，已選 1）/);
    assert.match(sum, /標題列　第 1 列/);
    assert.match(sum, /成績欄　學期成績/);
    assert.match(sum, /共 10 人（2 個班級）/);
    assert.match(sum, /隱藏 2 列/);
    // 上次分組：預設套用，藍色提示
    assert.match(a.q('#gvPreview .alert.info').textContent, /偵測到「組別」欄，已當作「上次分組」/);
    assert.equal(a.q('select[data-i="1"]').value, 'group');
    // 缺考／請假小面板
    const pan = a.q('#gvIpanel');
    assert.ok(pan, '偵測到「假」要出現小面板');
    assert.match(pan.textContent, /假請假，出現 1 次/);
    // 多成績欄：預設只取最右
    assert.equal(a.q('[data-a="imerge"][aria-selected="true"]').getAttribute('data-v'), 'right');
    // 警告區：有請確認 → 預設展開
    assert.ok(a.qa('#gvWarns .wl.w').length >= 1);
    assert.match(a.q('.nexthint').textContent, /有 \d+ 項需要確認/);
    // 假 → 換算成 85 分
    const missBefore = a.S.roster.filter(x => x.score === '').length;
    a.change('select[data-in="ival"]', 'conv');
    const inp = a.q('input[data-in="ivaln"]');
    inp.value = '85'; inp.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.equal(a.S.roster.filter(x => x.score === '').length, missBefore - 1);
    assert.equal(a.d.activeElement === inp || a.q('input[data-in="ivaln"]') === inp, true, '打分數時輸入框不被重畫');
    // 納入隱藏列
    a.change('[data-a="ihidden"]', true);
    assert.equal(a.S.roster.length, 12);
    // 改選工作表：只要 3A
    a.change('[data-a="isheet"][data-v="0"]', false);
    a.change('[data-a="isheet"][data-v="1"]', true);
    assert.equal(a.S.roster.length, 6);
    assert.equal(a.S.roster[0].cls, '');
    a.change('[data-a="isheet"][data-v="0"]', true);
    a.change('[data-a="isheet"][data-v="1"]', false);
    // 改成績欄：只用一段
    a.act('iedit', 'score');
    a.change('#gvIscore', '4');
    assert.equal(a.S.roster[0].score, 70);
    assert.ok(!a.q('[data-a="imerge"]'), '只剩一個成績欄就沒有合併方式');
    // 改標題列 → 沒有標題
    a.act('iedit', 'hdr');
    a.change('#gvIhdr', '0');
    assert.equal(a.S.parsed.hdr, false);
    a.act('iedit', 'hdr');
    a.change('#gvIhdr', '1');
    assert.equal(a.S.parsed.hdrRow, 1);
    // 警告區可以收合
    const before = a.qa('#gvWarns .wl').length;
    a.act('iwarn');
    const after = a.qa('#gvWarns .wl').length;
    assert.ok(before !== after && Math.min(before, after) === 1, '收合時只剩一行');
});

test('匯入的組別進「避免與上次同組」比對清單（藍色「匯入」），也真的拿來避開；不進分組紀錄', { skip }, async () => {
    const a = await loadApp();
    a.U.setMode('group');
    a.act('src', 'file');
    await a.importBytes(fakeBook(), '假成績.xlsx');
    a.act('next1');
    assert.equal(a.S.step, 2);
    const it = a.q('.ghist li.imp');
    assert.ok(it, '比對清單有匯入的分組');
    assert.match(it.textContent, /匯入的分組（來自檔案「組別」欄）/);
    assert.match(it.textContent, /6 組、10 人/);
    a.act('past', 'imp');
    assert.match(a.q('.ghist').textContent, /王小明/);
    // 4 組：每組 2～3 人，匯入的 6 組各 1～2 人 → 做得到就完全避開
    for (let i = 0; i < 6; i++) a.act('num', '-1');
    for (let i = 0; i < 2; i++) a.act('num', '1');
    a.act('start');
    assert.equal(a.S.step, 3);
    assert.equal(a.S.recs.length, 1, '匯入的分組不會變成分組紀錄');
    const prev = new Map();
    a.S.ires.prevGroupLabels.forEach((l, i) => { if (l) prev.set(i, l); });
    const pairs = a.S.groups.map(g => g.filter(i => prev.has(i))).reduce((t, g) => { for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) if (prev.get(g[x]) === prev.get(g[y])) t++; return t; }, 0);
    assert.equal(pairs, 0, '和匯入的組別沒有人重複同組');
    // 表頭改成「略過」→ 清單不再有匯入
    a.act('step', '1');
    a.change('select[data-i="1"]', 'skip');
    a.act('next1');
    assert.equal(a.q('.ghist li.imp'), null);
});

test('匯入 CSV：Big5 與 UTF-8；重新整理後名單還在', { skip }, async () => {
    const a = await loadApp();
    a.U.setMode('group');
    a.act('src', 'file');
    const text = '座號,姓名,成績\r\n1,王小明,85\r\n2,李小華,缺\r\n3,張小美,90\r\n';
    await a.importBytes(new TextEncoder().encode('﻿' + text), 'utf8.csv');
    assert.deepEqual(plain(a.S.roster.map(x => [x.no, x.name, x.score])), [['1', '王小明', 85], ['2', '李小華', ''], ['3', '張小美', 90]]);
    assert.equal(a.q('#gvSheets'), null, '只有一個工作表不出現清單');
    assert.match(a.q('#gvPreview td.orig').textContent, /缺/);
    // 重新整理：名單還在，提示要改判斷請重新選檔
    const saved = a.w.localStorage.getItem('seatHelperGroupV1');
    const b = await loadApp();
    b.w.localStorage.setItem('seatHelperGroupV1', saved);
    b.U.state.impSaved = JSON.parse(saved).impSaved; b.U.state.src = 'file';
    b.U.setMode('group');
    assert.equal(b.S.roster.length, 3);
    assert.match(b.q('#gvPreview').textContent, /這是上次匯入的名單（utf8\.csv）/);
});

test('貼上整張 Excel 表格（有標題、比重列、統計列）走同一條管線', { skip }, async () => {
    const a = await loadApp();
    a.U.setMode('group');
    const rows = [['', '', '30%', '70%'], ['座號', '姓名', '平時', '學期成績']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, 80, 70 + i]), [['平均', '', '80', '71.5']]);
    const el = a.q('#gvPaste');
    el.value = rows.map(r => r.join('\t')).join('\n'); el.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.equal(a.S.roster.length, 4);
    assert.equal(a.S.roster[3].score, 73);
    assert.equal(a.S.parsed.hdr, true);
    assert.equal(a.qa('#gvWarns .wl').length, 1, '只有資訊時收成一行');
    a.act('iwarn');
    assert.match(a.q('#gvWarns').textContent, /第 1 列是各項成績的比重/);
    assert.match(a.q('#gvWarns').textContent, /統計列「平均」/);
    assert.deepEqual(a.errors, []);
});
