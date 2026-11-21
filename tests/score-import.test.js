// 成績檔智慧匯入（ScoreImport）純邏輯測試。執行：node --test tests/
// 全部是捏造的假資料（假名、假成績），只模仿真實成績檔的「結構與髒資料規律」；樣本編號 T1–T20 對照 docs/dispatch/成績匯入研究.md 7.3。
// fromSheetJS 需要 SheetJS：沒有就跳過。安裝（不進 repo）：npm install --no-save xlsx@0.18.5；或設環境變數 XLSX_PATH 指到 xlsx 資料夾。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers');

const ctx = loadScripts(['group-logic', 'score-import']);
const SI = ctx.ScoreImport, GL = ctx.GroupLogic;
let XLSX = null;
try { XLSX = require(process.env.XLSX_PATH || 'xlsx'); } catch (e) { XLSX = null; }

const NAMES = '王小明 李小華 張小美 陳大文 林小安 黃志豪 吳雅婷 劉冠宇 蔡佳穎 楊承恩 許婉如 鄭宇軒 謝語彤 郭柏翰 洪慧君 曾思穎 邱品睿 廖若涵 賴冠廷 徐子晴 周柏宇 葉芷瑄 蘇冠霖 莊雅涵 江承翰 呂欣怡 何宥辰 蕭語嫣 羅子豪 高苡安 潘柏廷 簡妤潔'.split(' ');
const sc = i => 50 + ((i * i * 5 + i * 17 + 3) % 49);
const sheet = (name, rows, extra) => Object.assign({ name, rows, merges: [], hiddenRows: new Set(), hiddenCols: new Set(), hidden: false, pct: new Set() }, extra || {});
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m); // vm 裡建立的陣列原型不同，先轉成一般資料再比
const ALL = []; // 收集每次 analyze 的提醒，T20 檢查
function run(sheets, opts) { const r = SI.analyze(sheets, opts); ALL.push(...r.report.warnings); return r; }
const codes = r => r.report.warnings.map(w => w.code);
const plain = r => JSON.parse(JSON.stringify(r.roster));
const role = (r, label) => { const c = r.report.columns.find(x => x.label === label); return c && c.role; };

test('T1 標準四欄：班級、座號、姓名、成績', () => {
    const rows = [['班級', '座號', '姓名', '成績']].concat(NAMES.slice(0, 6).map((n, i) => ['3A', i + 1, n, sc(i)]));
    const r = run([sheet('工作表1', rows)]);
    assert.equal(r.roster.length, 6);
    deq(plain(r)[0], { cls: '3A', no: '1', name: '王小明', score: sc(0) });
    assert.equal(r.report.header[0].row, 1);
    assert.equal(r.report.confirm, 0, '標準名單不該有要確認的事');
    assert.equal(r.report.score.label, '成績');
    const info = GL.analyzeRoster(r.roster);
    assert.equal(info.hasScores, true);
});

test('T2 標題列在第 3 列、上方有合併儲存格橫幅', () => {
    const rows = [['○○中學 三年甲班 成績表', null, null], [null, null, null], ['座號', '姓名', '成績']].concat(NAMES.slice(0, 5).map((n, i) => [i + 1, n, sc(i)]));
    const r = run([sheet('成績', rows, { merges: [{ r1: 0, c1: 0, r2: 0, c2: 2 }] })]);
    assert.equal(r.report.header[0].row, 3);
    assert.equal(r.roster.length, 5);
    assert.equal(r.roster[4].name, '林小安');
});

test('T3 比重列（10%、0.3）與欄名比重（一段15%）、依比重加權', () => {
    const rows = [[null, null, '30%', '30%', '40%'], ['座號', '姓名', '作業', '小考', '期末']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, 80, 70, 90 - i]));
    const sh = sheet('成績', rows);
    const hdr = SI.findHeader(sh);
    assert.equal(hdr.row, 1); assert.equal(hdr.weightRow, 0);
    const lab = SI.flattenHeader(sh, hdr);
    deq(lab.slice(2).map(x => x.weight), [0.3, 0.3, 0.4]);
    let r = run([sh]);
    assert.ok(codes(r).includes('weightRow'));
    assert.equal(r.report.score.weights, true);
    assert.equal(r.roster[0].score, 90, '預設只取最右');
    r = run([sh], { override: { scoreMerge: 'weighted' } });
    assert.equal(r.roster[0].score, 0.3 * 80 + 0.3 * 70 + 0.4 * 90);
    r = run([sh], { override: { scoreMerge: 'mean' } });
    assert.equal(r.roster[0].score, 80);
    // 小數比重與欄名內的比重
    const sh2 = sheet('成績', [[null, null, 0.4, 0.6], ['座號', '姓名', '一段15%', '二段(20%)']].concat([[1, '王小明', 60, 80]]));
    const l2 = SI.flattenHeader(sh2, SI.findHeader(sh2));
    deq(l2.slice(2).map(x => [x.label, x.weight]), [['一段', 0.4], ['二段', 0.6]]);
    const sh3 = sheet('成績', [['座號', '姓名', '一段15%', '二段(20%)'], [1, '王小明', 60, 80]]);
    deq(SI.flattenHeader(sh3, SI.findHeader(sh3)).slice(2).map(x => [x.label, x.weight]), [['一段', 0.15], ['二段', 0.2]]);
});

test('T4 一班一張工作表 × 2（沒有班級欄）→ 兩班都選、班級＝工作表名稱', () => {
    const mk = (cls, off) => sheet(cls, [['組別', '座號', '姓名', '學期成績']].concat(NAMES.slice(off, off + 6).map((n, i) => [1 + (i % 3), i + 1, n, sc(off + i)])));
    const r = run([mk('三甲', 0), mk('三乙', 6)]);
    deq(r.report.sheets.map(s => s.selected), [true, true]);
    assert.equal(r.roster.length, 12);
    assert.equal(r.roster[0].cls, '三甲'); assert.equal(r.roster[11].cls, '三乙');
    assert.ok(codes(r).includes('clsFromSheet'));
    assert.equal(GL.analyzeRoster(r.roster).classMode, 'multi');
});

test('T5 五張工作表：並排彙總表（兩區塊）＋等第表＋結算表 → 只選彙總表', () => {
    const A = NAMES.slice(0, 6), B = NAMES.slice(6, 12);
    const head = ['班級', '分組', '座號', '姓名', '一段15%', '二段15%', '學期成績'];
    const sum = [head.concat([null], head)];
    for (let i = 0; i < 6; i++) sum.push(['3A', 1 + (i % 2), i + 1, A[i], 70 + i, 72, 80 + i, null, '3B', 1 + (i % 2), i + 1, B[i], 60 + i, 66, 75 + i]);
    const gradeSheet = (ns) => sheet('等第', [['座號', '姓名', '活動一', '活動二', '加扣分', '學期成績']].concat(ns.map((n, i) => [i + 1, n, ['A', 'B', 'C'][i % 3], i === 2 ? '缺' : 'A', i === 0 ? 3 : null, { err: '#VALUE!' }])));
    const settle = (ns) => sheet('結算', [['座號', '姓名', '活動一', '活動二', '學期成績']].concat(ns.map((n, i) => [i + 1, n, 95, 85, 90])));
    const r = run([sheet('彙總', sum), Object.assign(gradeSheet(A), { name: '3A等第' }), Object.assign(gradeSheet(B), { name: '3B等第' }), Object.assign(settle(A), { name: '3A結算' }), Object.assign(settle(B), { name: '3B結算' })]);
    deq(r.report.sheets.map(s => s.selected), [true, false, false, false, false]);
    assert.ok(r.report.sheets.slice(1).every(s => s.why === 'dup' && s.dupOf === '彙總'));
    assert.equal(r.roster.length, 12);
    deq([r.roster[0].cls, r.roster[6].cls], ['3A', '3B']);
    assert.equal(r.roster[6].score, 75, '右邊區塊取自己的學期成績');
    assert.equal(r.report.preview.cols.length, 7);
    assert.ok(/另 4 個工作表的人和它重複/.test(r.report.warnings.find(w => w.code === 'sheets').text));
    assert.ok(r.prevGroupLabels.every(Boolean));
    const blocks = SI.splitBlocks(SI.trimSheet(sheet('彙總', sum)), SI.findHeader(sheet('彙總', sum)), SI.flattenHeader(sheet('彙總', sum), SI.findHeader(sheet('彙總', sum))));
    deq(blocks.map(b => [b.c1, b.c2]), [[0, 6], [8, 14]]);
    // 等第表單獨匯入：公式欄整欄錯誤不能選，等第欄用換算表
    const g = run([Object.assign(gradeSheet(A), { name: '3A等第' })]);
    assert.equal(role(g, '學期成績'), 'skip');
    assert.equal(role(g, '加扣分'), 'skip');
    assert.equal(g.roster[0].score, 95, '活動二最右：A＝95');
    assert.equal(g.roster[2].score, '', '缺＝沒有成績');
    assert.ok(g.report.sheets[0].gradeOnly);
});

test('T6 表尾統計列（平均、最高、最低）與尾端上千個空列', () => {
    const rows = [['座號', '姓名', '成績']].concat(NAMES.slice(0, 5).map((n, i) => [i + 1, n, sc(i)]));
    rows.push(['平均', null, 70.2], ['最高', null, 98], ['最低', null, 51]);
    for (let i = 0; i < 1000; i++) rows.push([null, null, null]);
    const sh = sheet('成績', rows, { merges: [{ r1: 6, c1: 0, r2: 6, c2: 1 }] });
    assert.equal(SI.trimSheet(sh).rows.length, 9);
    const r = run([sh]);
    assert.equal(r.roster.length, 5);
    deq(r.report.skipped.map(s => [s.row, s.why]), [[7, 'stat']]);
    assert.ok(/第 7 列是統計列「平均」/.test(r.report.warnings.find(w => w.code === 'skipped').text));
});

test('T7 等第 A／B／C、缺、假、空白混在同一欄', () => {
    const vals = ['A', 'B', 'C', '缺', '假', null, 'b', 'A+'];
    const rows = [['座號', '姓名', '等第']].concat(vals.map((v, i) => [i + 1, NAMES[i], v]));
    let r = run([sheet('成績', rows)]);
    deq(r.roster.map(x => x.score), [95, 85, 75, '', '', '', 85, 98]);
    const v = r.report.values;
    deq(v.filter(x => x.type === 'absent').map(x => [x.raw, x.cat, x.value]), [['缺', '缺考', null], ['假', '請假', null]]);
    deq(v.filter(x => x.type === 'grade').map(x => [x.raw, x.count]), [['A', 1], ['A+', 1], ['B', 2], ['C', 1]]);
    assert.ok(codes(r).includes('gradeConv') && codes(r).includes('nonNumeric') && codes(r).includes('missing'));
    r = run([sheet('成績', rows)], { override: { absent: { 假: 85, 缺: 0 }, grades: { A: 90 } } });
    deq(r.roster.map(x => x.score), [90, 85, 75, 0, 85, '', 85, 93]);
    r = run([sheet('成績', rows)], { override: { grades: { A: null, B: null, C: null } } });
    assert.equal(r.roster[0].score, '');
    assert.equal(r.roster[7].score, '', 'A 設成沒有成績，A+ 也沒有');
});

test('T8 成績寫法：空白、85分、全形、85%、百分比格式、小數', () => {
    const t = c => SI.toScore(c, {}).v;
    assert.equal(t(' 85 '), 85); assert.equal(t('85分'), 85); assert.equal(t('８５'), 85); assert.equal(t('85%'), 85); assert.equal(t('85.5'), 85.5); assert.equal(t(72), 72);
    assert.equal(SI.toScore(0.85, { pct: true }).v, 85);
    const rows = [['座號', '姓名', '成績']].concat([0.85, 0.7, 0.925].map((v, i) => [i + 1, NAMES[i], v]));
    const r = run([sheet('成績', rows, { pct: new Set(['1,2', '2,2', '3,2']) })]);
    deq(r.roster.map(x => x.score), [85, 70, 92.5]);
    deq(SI.toScore('優秀', {}), { miss: 'text', raw: '優秀', kind: 'text' });
});

test('T9 同名不同座號、完全重複列、姓名空白與註記', () => {
    const rows = [['座號', '姓名', '成績'], [1, '王 小明', 80], [2, '陳　大文', 70], [3, '王小明', 66], [4, '李小華', 90], [4, '李小華', 90], [5, '張小美(轉出)', 60], [6, '林 小 安', 77]];
    const r = run([sheet('成績', rows)]);
    deq(r.roster.map(x => x.name), ['王小明', '陳大文', '王小明', '李小華', '張小美(轉出)', '林小安']);
    assert.ok(codes(r).includes('dupName') && codes(r).includes('dupRow') && codes(r).includes('note'));
    assert.ok(/有 2 位同名「王小明」（座號 1、3）/.test(r.report.warnings.find(w => w.code === 'dupName').text));
    deq(SI.cleanName(' 黃 志豪＊ '), { name: '黃志豪*', note: '*' });
    assert.equal(SI.cleanName('Mary  Lin').name, 'Mary Lin');
});

test('T10 組別、座號、學號、姓名順序打亂', () => {
    const rows = [['組別', '學號', '座號', '姓名', '成績']].concat(NAMES.slice(0, 8).map((n, i) => [1 + (i % 3), 11201 + i, i + 1, n, sc(i)]));
    const r = run([sheet('成績', rows)]);
    deq(['組別', '學號', '座號', '姓名', '成績'].map(l => role(r, l)), ['group', 'skip', 'no', 'name', 'score']);
    assert.equal(r.roster[3].no, '4');
    // 沒有欄名：小數字不重複 → 座號；學號長數字 → 略過
    const p = SI.fromRows(NAMES.slice(0, 6).map((n, i) => [11201 + i, i + 1, n, sc(i)].join('\t')).join('\n'));
    const r2 = run([p]);
    deq(r2.report.columns.map(c => c.role), ['skip', 'no', 'name', 'score']);
});

test('T11 加扣分欄（多數空白）與多個「平均」欄，只選學期成績', () => {
    const rows = [['座號', '姓名', '活動一', '活動二', '活動平均', '加扣分', '原始成績', '學期成績']].concat(NAMES.slice(0, 10).map((n, i) => [i + 1, n, 80, 70, 75, i === 1 ? 3 : null, 76, 77 + (i % 5)]));
    const r = run([sheet('成績', rows)]);
    assert.equal(role(r, '學期成績'), 'score');
    assert.equal(role(r, '加扣分'), 'skip');
    assert.equal(r.roster[0].score, 77);
    assert.equal(r.report.score.label, '學期成績');
    assert.equal(r.report.score.multi, true);
    assert.ok(codes(r).includes('multiScore'));
    // 沒有欄名寫「學期成績」：先用最右邊並請老師確認
    const rows2 = [['座號', '姓名', '活動一', '活動二', '加扣分']].concat(NAMES.slice(0, 6).map((n, i) => [i + 1, n, 80, 70 + i, i ? null : 6]));
    const r2 = run([sheet('成績', rows2)]);
    assert.equal(r2.roster[2].score, 72);
    assert.equal(r2.report.score.confidence, 'low');
    assert.ok(codes(r2).includes('noTotal'));
    // 學期成績在左、補考在右：仍選學期成績，右邊的略過
    const r3 = run([sheet('成績', [['座號', '姓名', '學期成績', '補考']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, 60 + i, 70])))]);
    assert.equal(r3.roster[1].score, 61);
    assert.equal(role(r3, '補考'), 'skip');
});

test('T12 整欄公式錯誤；公式沒有計算結果；部分錯誤', () => {
    const e = { err: '#DIV/0!' }, f = { formulaNoValue: true };
    let r = run([sheet('成績', [['座號', '姓名', '學期成績']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, e])))]);
    assert.ok(codes(r).includes('allErr'));
    assert.equal(r.report.warnings.find(w => w.code === 'allErr').level, 'error');
    r = run([sheet('成績', [['座號', '姓名', '學期成績']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, f])))]);
    assert.ok(codes(r).includes('fnv'));
    r = run([sheet('成績', [['座號', '姓名', '學期成績']].concat(NAMES.slice(0, 4).map((n, i) => [i + 1, n, i === 1 ? { err: '#VALUE!' } : 80])))]);
    assert.ok(codes(r).includes('errCells'));
    assert.equal(r.roster[1].score, '');
    assert.equal(r.report.preview.rows[1].cells[2].t, '公式錯誤');
});

test('T13 CSV：UTF-8（有／無 BOM）、Big5', () => {
    const text = '座號,姓名,成績\r\n1,王小明,85\r\n2,"李,小華",90\r\n';
    const u8 = Buffer.from(text, 'utf8');
    assert.equal(SI.decodeCsv(new Uint8Array(u8)), text);
    assert.equal(SI.decodeCsv(new Uint8Array(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), u8]))), text);
    const big5 = encodeBig5(text);
    assert.notEqual(big5.length, u8.length);
    assert.equal(SI.decodeCsv(big5), text);
    const sh = SI.fromRows(SI.decodeCsv(big5), 'a.csv');
    deq(sh.rows[2], ['2', '李,小華', '90']);
    const r = run([sh]);
    deq(plain(r), [{ cls: '', no: '1', name: '王小明', score: 85 }, { cls: '', no: '2', name: '李,小華', score: 90 }].slice(0, 1).concat(plain(r).slice(1)));
    assert.equal(r.roster[0].score, 85);
});

test('T14 隱藏工作表、隱藏列', () => {
    const rows = [['座號', '姓名', '成績']].concat(NAMES.slice(0, 6).map((n, i) => [i + 1, n, sc(i)]));
    const vis = sheet('名單', rows, { hiddenRows: new Set([2, 5]) }), hid = sheet('舊資料', rows.slice(), { hidden: true });
    let r = run([vis, hid]);
    deq(r.report.sheets.map(s => [s.selected, s.why]), [[true, 'list'], [false, 'hidden']]);
    assert.equal(r.roster.length, 4);
    assert.equal(r.report.hidden, 2);
    assert.ok(codes(r).includes('hiddenRows') && codes(r).includes('hiddenSheets'));
    r = run([vis, hid], { override: { includeHidden: true } });
    assert.equal(r.roster.length, 6);
    assert.ok(codes(r).includes('hiddenIn'));
    r = run([vis, hid], { override: { sheets: [] } });
    assert.ok(codes(r).includes('noSheet'));
    r = run([vis, hid], { override: { sheets: ['名單', '舊資料'] } });
    assert.equal(r.roster.length, 10, '自己勾選隱藏的工作表也可以（同名同座號的重複列合併）');
});

test('T15 貼上：只有姓名、座號＋姓名、班級座號姓名成績（Tab）、沒有標題', () => {
    let r = run([SI.fromRows('王小明\n李小華\n張小美')], { autoNo: true });
    deq(plain(r).map(x => [x.no, x.name, x.score]), [['1', '王小明', ''], ['2', '李小華', ''], ['3', '張小美', '']]);
    assert.ok(codes(r).includes('noScore'));
    r = run([SI.fromRows('1 王小明\n2 李小華\n3 張小美')]);
    deq(r.report.columns.map(c => c.role), ['no', 'name']);
    r = run([SI.fromRows(NAMES.slice(0, 5).map((n, i) => ['3A', i + 1, n, sc(i)].join('\t')).join('\n'))]);
    deq(r.report.columns.map(c => c.role), ['cls', 'no', 'name', 'score']);
    assert.equal(r.report.confirm, 0);
    r = run([SI.fromRows('姓名\n王小明\n李小華')]);
    assert.equal(r.report.header[0].row, 1);
    assert.equal(r.roster.length, 2);
    r = run([SI.fromRows('姓名，成績\n王小明，88')]);
    assert.equal(r.roster[0].score, 88);
});

test('T16 沒有標題、欄序顛倒（成績在最前、姓名在最後）', () => {
    const p = SI.fromRows(NAMES.slice(0, 6).map((n, i) => [sc(i), i + 1, n].join('\t')).join('\n'));
    const r = run([p]);
    deq(r.report.columns.map(c => c.role), ['score', 'no', 'name']);
    assert.equal(r.roster[2].score, sc(2));
});

test('T17 多層標題（合併儲存格上層＋下層）', () => {
    const rows = [['座號', '姓名', '第一次段考', null, '第二次段考', null], [null, null, '國文', '數學', '國文', '數學'], [1, '王小明', 80, 70, 90, 60], [2, '李小華', 60, 65, 70, 75]];
    const sh = sheet('成績', rows, { merges: [{ r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 1, r2: 1, c2: 1 }, { r1: 0, c1: 2, r2: 0, c2: 3 }, { r1: 0, c1: 4, r2: 0, c2: 5 }] });
    const hdr = SI.findHeader(sh);
    deq([hdr.upperRow, hdr.row], [0, 1]);
    deq(SI.flattenHeader(sh, hdr).map(x => x.label), ['座號', '姓名', '第一次段考｜國文', '第一次段考｜數學', '第二次段考｜國文', '第二次段考｜數學']);
    const r = run([sh]);
    assert.equal(r.roster.length, 2);
    assert.equal(r.roster[1].score, 75);
    deq(r.report.skipped, []);
});

test('T18 兩個學期對應：全對上、座號改變、改名、轉入、轉出、班級改名', () => {
    const A = NAMES.slice(0, 10).map((n, i) => ({ cls: '二甲', no: String(i + 1), name: n, score: '' }));
    const B = A.map(x => Object.assign({}, x, { cls: '三甲' }));
    B[1].no = '20';                 // 座號改變
    B[2].name = '張小玫';            // 改名（座號相同）
    B.splice(3, 1);                 // 轉出
    B.push({ cls: '三甲', no: '11', name: '簡妤潔', score: '' }); // 轉入
    const m = SI.matchStudents(A, B);
    deq(m.classMap, { 二甲: { to: '三甲', overlap: 80 } });
    assert.equal(m.matched.length, 8);
    deq(m.onlyA.map(i => A[i].name), ['張小美', '陳大文']);
    deq(m.onlyB.map(j => B[j].name), ['張小玫', '簡妤潔']);
    deq(m.seatSame.map(p => [A[p[0]].name, B[p[1]].name]), [['張小美', '張小玫']]);
    // 同班同名：用座號分辨；分不出來列為不確定
    const C2 = [{ cls: '', no: '1', name: '王小明' }, { cls: '', no: '2', name: '王小明' }];
    deq(SI.matchStudents(C2, [{ cls: '', no: '2', name: '王小明' }, { cls: '', no: '1', name: '王 小明' }]).matched, [[0, 1], [1, 0]]);
    deq(SI.matchStudents(C2, [{ cls: '', no: '7', name: '王小明' }, { cls: '', no: '8', name: '王小明' }]).ambiguous, [0, 1]);
});

test('T19 組別欄 → 上次分組 → 可餵給 groupRoster 的 avoid', () => {
    const rows = [['班級', '組別', '座號', '姓名', '成績']].concat(NAMES.slice(0, 12).map((n, i) => [i < 6 ? '3A' : '3B', 1 + (i % 3), i < 6 ? i + 1 : i - 5, n, sc(i)]));
    const r = run([sheet('成績', rows)]);
    assert.equal(role(r, '組別'), 'group');
    assert.equal(r.prevGroupLabels[0], '3A#1');
    assert.equal(r.prevGroupLabels[6], '3B#1', '不同班的第 1 組要分開');
    deq(JSON.parse(JSON.stringify(r.report.group)), { label: '組別', groups: 6, people: 12 });
    const avoid = SI.toAvoidGrouping(r.roster, r.prevGroupLabels);
    assert.equal(avoid.length, 6);
    assert.equal(avoid[0][0], GL.studentKey(r.roster[0]));
    const g = GL.groupRoster(r.roster, { method: 'random', count: 3, avoid: [avoid], seed: 7 });
    assert.equal(g.groups.reduce((t, x) => t + x.length, 0), 12);
    // 自動補座號之後才換成鍵：鍵要對得上補好的座號
    const r2 = run([SI.fromRows('組別\t姓名\n1\t王小明\n1\t李小華\n2\t張小美')], { autoNo: true });
    deq(Array.from(SI.toAvoidGrouping(r2.roster, r2.prevGroupLabels)[0]), [GL.studentKey({ cls: '', no: '1', name: '王小明' }), GL.studentKey({ cls: '', no: '2', name: '李小華' })]);
    // 老師把組別欄改成「略過」
    const key = r.report.columns.find(c => c.label === '組別').key;
    const r3 = run([sheet('成績', rows)], { override: { roles: { [key]: 'skip' } } });
    assert.ok(r3.prevGroupLabels.every(x => x === null));
    assert.equal(r3.report.group, null);
});

test('opts.override：改標題列、改欄位角色；同樣輸入得到同樣結果', () => {
    const rows = [['說明：本表為假資料', null, null], ['座號', '姓名', '分數'], [1, '王小明', 80], [2, '李小華', 90], [3, '張小美', 70]];
    const sh = sheet('成績', rows);
    const a = run([sh]), b = run([sh]);
    deq(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    const r = run([sh], { override: { headerRow: { 成績: 0 } } });
    assert.equal(r.report.header[0].row, 0);
    const k = a.report.columns.find(c => c.label === '座號').key;
    const r2 = run([sh], { override: { roles: { [k]: 'score' } } });
    deq(r2.roster.map(x => x.score), [90, 80, 70].map((_, i) => [80, 90, 70][i]), '多個成績欄、預設只取最右');
    const r3 = run([sh], { override: { roles: { [k]: 'score' }, scoreMerge: 'mean' } });
    deq(r3.roster.map(x => x.score), [40.5, 46, 36.5]);
    deq(SI.sameColumnKeys(a.report, k), [k]);
    assert.throws(() => SI.analyze('x'), TypeError);
    // 兩個區塊：同欄名同位置的欄一起改
    const t = run([sheet('彙總', [['座號', '姓名', '成績', null, '座號', '姓名', '成績'], [1, '王小明', 80, null, 1, '李小華', 70]])]);
    const k1 = t.report.columns.find(c => c.label === '成績').key;
    assert.equal(SI.sameColumnKeys(t.report, k1).length, 2);
});

test('同班座號重複、成績超出 0～100、只有部分成績欄、找不到姓名', () => {
    let r = run([sheet('成績', [['座號', '姓名', '成績'], [1, '王小明', 101], [1, '李小華', -3], [2, '張小美', 80]])]);
    assert.ok(codes(r).includes('dupNo') && codes(r).includes('range'));
    r = run([sheet('成績', [['座號', '姓名', '作業', '小考'], [1, '王小明', 80, null], [2, '李小華', 70, 90], [3, '張小美', 60, 70]])], { override: { scoreMerge: 'mean' } });
    assert.equal(r.roster[0].score, 80);
    assert.ok(codes(r).includes('partial'));
    r = run([sheet('成績', [[1, 2], [3, 4], [5, 6]])]);
    assert.ok(codes(r).includes('noName'));
    r = run([sheet('成績', [['座號', '姓名'], [1, '12345'], [2, 'A']])]);
    assert.ok(codes(r).includes('noPeople'));
    assert.ok(codes(r).includes('skipped'));
    r = run([sheet('成績', [['座號', '名單', '成績'], [1, '王小明', 80], [2, '李小華', 70], [3, '張小美', 75]])]);
    assert.ok(codes(r).includes('unsure'), '欄名不是「姓名」但內容像人名：請確認');
});

test('fromSheetJS：錯誤值、公式沒有結果、合併、隱藏列欄、隱藏工作表、百分比格式', { skip: XLSX ? false : '沒有安裝 xlsx（npm install --no-save xlsx@0.18.5），跳過' }, () => {
    const ws = XLSX.utils.aoa_to_sheet([['○○中學成績表'], ['座號', '姓名', '成績', '比例'], [1, '王小明', 85, 0.85], [2, '李小華', 90, 0.9], ['平均', null, 87.5, null]]);
    ws.C3 = { t: 'e', v: 0x07 }; ws.C4 = { t: 'n', f: 'A1/0' };
    ws.D3.z = '0%'; ws.D4.z = '0%';
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws['!rows'] = [null, null, null, { hidden: true }];
    ws['!cols'] = [null, { hidden: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '成績');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), '隱藏');
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true });
    const sheets = SI.fromSheetJS(back, XLSX);
    assert.equal(sheets.length, 2);
    assert.equal(sheets[1].hidden, true);
    const s = sheets[0];
    assert.equal(s.rows[2][2].err, '#DIV/0!');
    assert.ok(s.rows[3][2] && (s.rows[3][2].formulaNoValue || s.rows[3][2].err), '公式沒有結果');
    deq(JSON.parse(JSON.stringify(s.merges)), [{ r1: 0, c1: 0, r2: 0, c2: 3 }]);
    assert.ok(s.hiddenRows.has(3)); assert.ok(s.hiddenCols.has(1));
    assert.ok(s.pct.has('2,3'));
    const r = SI.analyze(sheets);
    assert.equal(r.report.sheets[0].selected, true);
    assert.equal(r.report.header[0].row, 2);
});

test('T20 每一則提醒都至少出現過，而且是老師看得懂的話', () => {
    const need = ['sheets', 'hiddenSheets', 'clsFromSheet', 'noName', 'noPeople', 'weightRow', 'skipped', 'hiddenRows', 'hiddenIn', 'noScore', 'allErr', 'fnv', 'noTotal', 'multiScore', 'errCells', 'nonNumeric', 'gradeConv', 'missing', 'partial', 'dupRow', 'dupName', 'dupNo', 'range', 'note', 'unsure', 'noSheet'];
    const seen = new Set(ALL.map(w => w.code));
    const lack = need.filter(c => !seen.has(c));
    // oneScore：有學期成績、另有一般成績欄
    const r = SI.analyze([sheet('成績', [['座號', '姓名', '作業', '學期成績'], [1, '王小明', 80, 85], [2, '李小華', 70, 75]])]);
    ALL.push(...r.report.warnings);
    assert.ok(codes(r).includes('oneScore'));
    deq(lack.filter(c => !new Set(ALL.map(w => w.code)).has(c)), []);
    ALL.forEach(w => {
        assert.ok(['info', 'warn', 'error'].includes(w.level));
        assert.ok(!/undefined|NaN|null|\[object/.test(w.text), w.code + '：' + w.text);
        assert.ok(!/(sheet|header|column|roster|score|block)/i.test(w.text), '不出現程式術語：' + w.text);
    });
});

/* Big5 編碼器：用 TextDecoder('big5') 反查（只為了產生測試位元組） */
function encodeBig5(str) {
    const dec = new TextDecoder('big5'), map = new Map(), out = [];
    for (let a = 0x81; a <= 0xFE; a++) {
        const pairs = [];
        for (let b = 0x40; b <= 0xFE; b++) if (b <= 0x7E || b >= 0xA1) pairs.push(a, b);
        const s = dec.decode(new Uint8Array(pairs));
        let k = 0;
        for (const ch of s) { const i = k * 2; if (!map.has(ch) && ch !== '�') map.set(ch, [pairs[i], pairs[i + 1]]); k++; }
    }
    for (const ch of str) { if (ch.charCodeAt(0) < 0x80) out.push(ch.charCodeAt(0)); else { const p = map.get(ch); if (!p) throw new Error('Big5 沒有這個字：' + ch); out.push(p[0], p[1]); } }
    return new Uint8Array(out);
}
