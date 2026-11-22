// 分組功能邏輯層測試。執行：node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, loadGroupLogic, openPackage, tinyPng, makeRoster } = require('./helpers');

const GL = loadGroupLogic();
const plain = x => JSON.parse(JSON.stringify(x)); // vm 內外的陣列原型不同，比對前轉成一般物件
const DATE = new Date(2026, 10, 21, 14, 32);
const flat = gs => [].concat(...plain(gs));
const sizes = gs => plain(gs).map(g => g.length);
function assertPartition(groups, ids) {
    assert.deepEqual(flat(groups).map(String).sort(), ids.map(String).sort(), '每個人剛好出現一次');
    const s = sizes(groups);
    assert.ok(Math.max(...s) - Math.min(...s) <= 1, '各組差距最多 1 人：' + s);
    for (let i = 1; i < s.length; i++) assert.ok(s[i - 1] >= s[i], '前幾組多 1 人：' + s);
}

test('index.html 與 seat_helper.html 內容完全相同', () => {
    assert.equal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'seat_helper.html'), 'utf8'));
});

test('各組人數：不整除時前幾組多 1 人；組數大於人數時每組 1 人', () => {
    assert.deepEqual(plain(GL.groupSizes(10, 3)), [4, 3, 3]);
    assert.deepEqual(plain(GL.groupSizes(12, 4)), [3, 3, 3, 3]);
    assert.deepEqual(plain(GL.groupSizes(31, 8)), [4, 4, 4, 4, 4, 4, 4, 3]);
    assert.deepEqual(plain(GL.groupSizes(5, 8)), [1, 1, 1, 1, 1]);
    assert.deepEqual(plain(GL.groupSizes(0, 3)), []);
    assert.deepEqual(plain(GL.resolveGroupCount(30, 'size', 4)), { count: 8, sizes: [4, 4, 4, 4, 4, 4, 3, 3], clamped: false });
    assert.deepEqual(plain(GL.resolveGroupCount(10, 'size', 4)).sizes, [4, 3, 3]);
    assert.equal(GL.resolveGroupCount(5, 'count', 8).clamped, true);
    assert.equal(GL.sizeText([[1, 2, 3], [4, 5]]), '每組 2～3 人');
    assert.equal(GL.sizeText([[1, 2], [4, 5]]), '每組 2 人');
});

test('隨機分組：人人剛好一次、可用種子重現', () => {
    const ids = Array.from({ length: 31 }, (_, i) => i);
    const a = GL.randomGroups(ids, 8, { seed: 7 }), b = GL.randomGroups(ids, 8, { seed: 7 });
    assertPartition(a.groups, ids);
    assert.deepEqual(plain(a.groups), plain(b.groups));
    assert.equal(a.notice, '');
    const many = GL.randomGroups([1, 2, 3], 10, { seed: 1 });
    assert.deepEqual(sizes(many.groups), [1, 1, 1]);
    assert.deepEqual(plain(GL.randomGroups([], 3, { seed: 1 }).groups), []);
});

test('避免同組：做得到時完全避開', () => {
    const ids = Array.from({ length: 12 }, (_, i) => i);
    const past = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]];
    for (let seed = 1; seed <= 20; seed++) {
        const r = GL.randomGroups(ids, 4, { seed, avoid: [past] });
        assertPartition(r.groups, ids);
        assert.equal(r.repeats.pairCount, 0, 'seed ' + seed);
        assert.equal(r.notice, '');
    }
});

test('避免同組：做不到時照常分組並提示幾組沒避開', () => {
    const ids = [0, 1, 2, 3, 4, 5];
    const r = GL.randomGroups(ids, 2, { seed: 3, avoid: [[[0, 1, 2, 3, 4, 5]]] });
    assertPartition(r.groups, ids);
    assert.equal(r.repeats.groupCount, 2);
    assert.equal(r.repeats.pairCount, 6);
    assert.equal(r.notice, '有 6 對同學無法避開上次的同組');
    // 有給 nameOf 時列出名字，對數多時截斷成「…等 N 對」
    const nm = i => '甲乙丙丁戊己'[i];
    assert.equal(GL.avoidNotice({ pairCount: 2, groupCount: 2, pairs: [[1, 2], [3, 0]] }, 3, nm), '有 2 對同學無法避開最近 3 次的同組：乙＆丙、丁＆甲');
    assert.equal(GL.avoidNotice(r.repeats, 1, nm, 3), '有 6 對同學無法避開上次的同組：' + r.repeats.pairs.slice(0, 3).map(p => nm(p[0]) + '＆' + nm(p[1])).join('、') + '…等 6 對');
    assert.equal(GL.avoidNotice({ pairCount: 0, groupCount: 0, pairs: [] }, 3, nm), '');
    // 比對最近 3 次：盡量減少，提示寫「最近 3 次」
    const past3 = [[[0, 1], [2, 3], [4, 5]], [[0, 2], [1, 3], [4, 5]], [[0, 3], [1, 2], [4, 5]]];
    const r3 = GL.randomGroups(ids, 2, { seed: 5, avoid: past3 });
    assertPartition(r3.groups, ids);
    const best = Math.min(...[[0, 1, 2], [0, 1, 3], [0, 1, 4], [0, 1, 5], [0, 2, 3], [0, 2, 4], [0, 2, 5], [0, 3, 4], [0, 3, 5], [0, 4, 5]]
        .map(g => GL.repeatPairs([g, ids.filter(x => !g.includes(x))], past3).pairCount));
    assert.equal(r3.repeats.pairCount, best, '找到最少重複對數');
    if (best) assert.match(r3.notice, /^有 \d+ 對同學無法避開最近 3 次的同組/);
});

test('按成績：輪流發牌（高到低一人一組輪流）', () => {
    const items = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91].map((s, i) => ({ id: i, score: s }));
    assert.deepEqual(plain(GL.scoreGroups(items, 3, 'round')), [[0, 3, 6, 9], [1, 4, 7], [2, 5, 8]]);
});

test('按成績：S 型；最後一輪反向時大組仍排前面', () => {
    const items = [100, 99, 98, 97, 96, 95, 94, 93].map((s, i) => ({ id: i, score: s }));
    assert.deepEqual(plain(GL.scoreGroups(items, 4, 'snake')), [[0, 7], [1, 6], [2, 5], [3, 4]]);
    const six = items.slice(0, 6);
    assert.deepEqual(plain(GL.scoreGroups(six, 4, 'snake')), [[2, 5], [3, 4], [0], [1]]);
    // 同分照原順序（穩定）
    assert.deepEqual(plain(GL.scoreGroups([{ id: 'a', score: 80 }, { id: 'b', score: 80 }], 2, 'snake')), [['a'], ['b']]);
});

test('按成績：總平均一致不比 S 型差，且人數不變', () => {
    const roster = makeRoster(31);
    const items = roster.map((st, i) => ({ id: i, score: st.score }));
    const ids = roster.map((_, i) => i);
    const sn = GL.scoreGroups(items, 8, 'snake'), bal = GL.scoreGroups(items, 8, 'balanced');
    assertPartition(bal, ids);
    assert.deepEqual(sizes(bal), sizes(sn));
    const spread = g => GL.spreadOf(GL.groupAverages(g, roster));
    assert.ok(spread(bal) <= spread(sn) + 1e-9, spread(bal) + ' vs ' + spread(sn));
    assert.ok(spread(bal) < 1.5, '平均差距應很小：' + spread(bal));
});

test('按成績：缺成績要先處理', () => {
    const roster = makeRoster(5); roster[1].score = ''; roster[3].score = '缺';
    assert.deepEqual(plain(GL.missingScores(roster)), [1, 3]);
    assert.throws(() => GL.scoreGroups(roster.map((st, i) => ({ id: i, score: st.score })), 2, 'snake'), /需要每個人都有成績/);
    const r = GL.groupRoster(roster, { method: 'snake', count: 2, indices: [0, 2, 4] });
    assertPartition(r.groups, [0, 2, 4]);
    assert.throws(() => GL.scoreGroups([], 2, 'xx'), /不認得/);
});

test('groupRoster：用 studentKey 比對過去分組，同名同號也不會掉人', () => {
    const roster = makeRoster(8, { cls: 'one' });
    roster.push({ cls: '3A', no: '', name: '重名' }, { cls: '3A', no: '', name: '重名' });
    const keys = roster.map(GL.studentKey);
    const r = GL.groupRoster(roster, { method: 'random', count: 3, seed: 2, avoid: [[keys.slice(0, 5), keys.slice(5)]] });
    assertPartition(r.groups, roster.map((_, i) => i));
    const s = GL.groupRoster(roster.slice(0, 8), { method: 'round', count: 2, avoid: [[keys.slice(0, 8)]] });
    assert.equal(s.repeats.pairCount, 12); // 兩組各 4 人，全部曾同組
});

test('智慧判斷：成績與班級', () => {
    assert.deepEqual(plain(GL.analyzeRoster(makeRoster(4))), { count: 4, hasScores: true, classMode: 'none', className: '', classes: [] });
    const one = GL.analyzeRoster(makeRoster(4, { cls: 'one', scores: false }));
    assert.equal(one.classMode, 'one'); assert.equal(one.className, '3A'); assert.equal(one.hasScores, false);
    assert.equal(GL.analyzeRoster(makeRoster(4, { cls: 'multi' })).classMode, 'multi');
    assert.equal(GL.toScore(' 87.5 '), 87.5); assert.equal(GL.toScore('八十'), null); assert.equal(GL.toScore(0), 0);
    assert.deepEqual(plain(GL.groupPages({ hasScores: false }, {})), [false]);
    assert.deepEqual(plain(GL.groupPages({ hasScores: true }, {})), [true, false]);
    assert.deepEqual(plain(GL.groupPages({ hasScores: true }, { withScore: false })), [false]);
    assert.deepEqual(plain(GL.groupPages({ hasScores: true }, { withScore: false, withoutScore: false })), []);
});

test('檔名：一班用班級、多班用「多班_」、沒班級不加前綴', () => {
    const d = '2026-11-21';
    assert.equal(GL.fileName('group', 'docx', GL.analyzeRoster(makeRoster(3, { cls: 'one' })), d), '3A_分組名單_2026-11-21.docx');
    assert.equal(GL.fileName('seat', 'xlsx', GL.analyzeRoster(makeRoster(3, { cls: 'multi' })), d), '多班_座位表_2026-11-21.xlsx');
    assert.equal(GL.fileName('group', 'xlsx', GL.analyzeRoster(makeRoster(3)), DATE), '分組名單_2026-11-21.xlsx');
    assert.equal(GL.fileName('seat', 'docx', { classMode: 'one', className: '3/A' }, d), '3_A_座位表_2026-11-21.docx');
});

test('傳統座位：座位塊依最多人那組，少的組空位留空', () => {
    const groups = [[0, 1, 2], [3, 4, 5], [6, 7]];
    const m = GL.tradSeatMap({ cols: 3, depth: 3, layout: 'row' }, groups);
    assert.equal(m.needed, 9); assert.equal(m.available, 9); assert.equal(m.lack, 0);
    assert.deepEqual(plain(m.cells['1,1']), { g: 0, k: 0, id: 0 });
    assert.deepEqual(plain(m.cells['3,3']), { g: 2, k: 2, id: null }, '第 3 組少 1 人，最後一格空著');
    const off = GL.tradSeatMap({ cols: 3, depth: 3, layout: 'row', off: ['2-2'] }, groups);
    assert.equal(off.lack, 1);
    assert.equal(off.cells['2,2'], undefined);
    // 2×2 方塊：4 人一組坐成田字
    const blk = GL.tradSeatMap({ cols: 4, depth: 2, layout: 'block' }, [[0, 1, 2, 3], [4, 5, 6, 7]]);
    assert.deepEqual(['1,1', '2,1', '1,2', '2,2'].map(k => blk.cells[k].g), [0, 0, 0, 0]);
    assert.deepEqual(['3,1', '4,1', '3,2', '4,2'].map(k => blk.cells[k].g), [1, 1, 1, 1]);
    // 直排一段：同組在同一排前後相鄰
    const col = GL.tradSeatMap({ cols: 2, depth: 4, layout: 'col' }, [[0, 1, 2, 3], [4, 5, 6, 7]]);
    assert.deepEqual([1, 2, 3, 4].map(d => col.cells['1,' + d].g), [0, 0, 0, 0]);
    // 5 人一組的方塊＝前後 2 × 3 排，空 1 格
    const b5 = GL.tradSeatMap({ cols: 6, depth: 2, layout: 'block' }, [[0, 1, 2, 3, 4], [5, 6, 7, 8]]);
    assert.equal(b5.needed, 12); assert.equal(b5.slotsPerGroup, 6);
    assert.equal(b5.cells['3,2'].id, null);
});

test('傳統座位（#46）：每組 6 人時整塊放、不在邊緣或列尾拆開；放不下才警告', () => {
    const g6 = [0, 1, 2, 3, 4].map(k => [0, 1, 2, 3, 4, 5].map(i => k * 6 + i)); // 5 組 × 6 人
    // 8 排 × 4 位置：方塊寬 3，8 排放不整（尾端殘塊）→ 完整方塊優先，不拆組
    const b = GL.tradSeatMap({ cols: 8, depth: 4, layout: 'block' }, g6);
    assert.equal(b.lack, 0); assert.deepEqual(plain(b.split), [], '2 個完整方塊塞得下 4 組，第 5 組用殘塊才會被警告');
    // 橫向一段：整組放同一位置的 6 排內，不在列尾換行
    const r = GL.tradSeatMap({ cols: 8, depth: 5, layout: 'row' }, g6);
    assert.deepEqual(plain(r.split), [], '橫向一段每組都連在一起');
    assert.ok(GL.tradSeatMap({ cols: 8, depth: 4, layout: 'row' }, g6).split.length > 0, '8×4 每排只放得下 1 組、共 4 排放不下 5 組：要警告而不是默默拆開');
    for (let k = 0; k < 5; k++) { const ds = new Set(Object.keys(r.cells).filter(c => r.cells[c] && r.cells[c].g === k).map(c => c.split(',')[1])); assert.equal(ds.size, 1, '第 ' + (k + 1) + ' 組在同一個位置'); }
    // 真的放不下時要被抓出來
    const bad = GL.tradSeatMap({ cols: 4, depth: 4, layout: 'row', off: ['2,1'] }, [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]);
    assert.ok(bad.split.length >= 1, '禁排把一條線切斷，無法整組放入時列為被拆開');
    // 4 人一組、剛好整除：原行為不變
    const ok = GL.tradSeatMap({ cols: 4, depth: 2, layout: 'block' }, [[0, 1, 2, 3], [4, 5, 6, 7]]);
    assert.deepEqual(plain(ok.split), []);
});

test('分組座位（桌子）：同組連續、面對面、缺座位', () => {
    const groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10], [11, 12, 13]];
    const m = GL.tableSeatMap([{ n: 8, shape: 'rect', ord: 'side' }, { n: 8, shape: 'rect', ord: 'face' }], groups);
    assert.equal(m.needed, 16); assert.equal(m.lack, 0);
    const t0 = plain(m.tables[0]), t1 = plain(m.tables[1]);
    assert.deepEqual(t0.top.map(s => s.g), [0, 0, 0, 0]); assert.deepEqual(t0.bot.map(s => s.g), [1, 1, 1, 1]);
    assert.deepEqual(t1.top.map(s => s.g), [2, 2, 3, 3], '面對面：同組分坐兩側');
    assert.equal(t1.bot[1].id, null, '第 3 組少 1 人（面對面第 4 個座位在下排）');
    assert.deepEqual(t0.groups, [0, 1]);
    assert.equal(t0.top[0].lbl, '1-1');
    const lack = GL.tableSeatMap([{ n: 6, shape: 'hex' }], groups);
    assert.equal(lack.lack, 10);
    const one = plain(GL.tableSeatMap([{ n: 4, shape: 'rect', one: true }], [[0, 1, 2, 3]]).tables[0]);
    assert.equal(one.top.length, 4); assert.equal(one.bot.length, 0);
});

test('zip：CRC32 正確', () => {
    assert.equal(GL.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

/* ── 下載檔：解壓、XML 結構、智慧判斷內容 ── */
function ctxFor(o) {
    const roster = makeRoster(o.n || 31, o);
    const groups = GL.scoreGroups(roster.map((st, i) => ({ id: i, score: o.scores === false ? 0 : st.score })), o.g || 8, 'snake');
    return { roster, groups, method: 'snake', date: DATE, appVersion: 'v9.9', options: o.options };
}
const docText = (pkg) => pkg.text.get('word/document.xml');

test('分組名單 Word：含成績與不含成績各自一頁（兩種都選＝兩頁）；多班有班級欄', () => {
    const p1 = openPackage(GL, GL.buildGroupDocx(ctxFor({ cls: 'one' })));
    const t1 = docText(p1);
    assert.ok(t1.includes('3A 分組名單') && t1.includes('含成績・老師用') && t1.includes('不含成績・可發給學生'));
    assert.equal((t1.match(/<w:sectPr>/g) || []).length, 2, '兩件事各一個區段（各一頁）');
    assert.ok(!t1.includes('<w:br w:type="page"/>') && !t1.includes('edge'), '沒有手動分頁，也沒有並排用的虛線');
    assert.ok(t1.indexOf('含成績・老師用') < t1.indexOf('<w:sectPr>') && t1.indexOf('不含成績・可發給學生') > t1.indexOf('<w:sectPr>'), '含成績在第一頁、不含成績在第二頁');
    assert.ok(t1.includes('各組平均最高與最低相差'));
    assert.ok(p1.text.get('word/footer1.xml').includes('NUMPAGES'));
    assert.ok(p1.text.get('word/footer1.xml').includes('座位小幫手 v9.9'));
    const p2 = docText(openPackage(GL, GL.buildGroupDocx(ctxFor({ scores: false }))));
    assert.ok(!p2.includes('含成績') && !p2.includes('平均') && p2.includes('>分組名單<'));
    assert.equal((p2.match(/<w:sectPr>/g) || []).length, 1);
    assert.ok(docText(openPackage(GL, GL.buildGroupDocx(ctxFor({ options: { withoutScore: false } })))).split('<w:sectPr>').length === 2, '只選一種＝一頁');
    const p3 = docText(openPackage(GL, GL.buildGroupDocx(ctxFor({ cls: 'multi' }))));
    assert.ok(p3.includes('>3B<') && !p3.includes('3A 分組名單'));
    const p4 = docText(openPackage(GL, GL.buildGroupDocx(ctxFor({ options: { withoutScore: false, showAvg: false } }))));
    assert.ok(p4.includes('含成績・老師用') && !p4.includes('不含成績・可發給學生') && !p4.includes('平均 '));
    assert.throws(() => GL.buildGroupDocx(ctxFor({ options: { withScore: false, withoutScore: false } })), /至少選一頁/);
});

test('分組名單 Excel：含成績、不含成績各一張工作表；成績存數字、資料表在列印範圍外、班級欄', () => {
    const p = openPackage(GL, GL.buildGroupXlsx(ctxFor({ cls: 'one' })));
    const wb = p.text.get('xl/workbook.xml');
    assert.ok(wb.includes('name="含成績"') && wb.includes('name="不含成績"') && !p.files.has('xl/worksheets/sheet3.xml'));
    const s1 = p.text.get('xl/worksheets/sheet1.xml'), s2 = p.text.get('xl/worksheets/sheet2.xml');
    assert.ok(!s1.includes('不含成績') && !s2.includes('含成績・老師用'), '兩件事不混在同一張');
    assert.match(s1, /<c r="[A-Z]+\d+" s="\d+"><v>\d+<\/v><\/c>/, '成績是數字');
    assert.ok(s1.includes('<t xml:space="preserve">平均</t>') && s1.includes('<t xml:space="preserve">成績</t>'), '右側可排序的資料表與各組平均');
    assert.ok(!s2.includes('>成績<'), '不含成績那張沒有成績');
    assert.ok(p.text.get('xl/styles.xml').includes('formatCode="0.0"'));
    const only = openPackage(GL, GL.buildGroupXlsx(ctxFor({ cls: 'one', options: { withoutScore: false } })));
    assert.ok(only.text.get('xl/workbook.xml').includes('name="含成績"') && !only.files.has('xl/worksheets/sheet2.xml'));
    const none = openPackage(GL, GL.buildGroupXlsx(ctxFor({ scores: false })));
    assert.ok(none.text.get('xl/workbook.xml').includes('name="分組名單"'));
    assert.ok(!none.files.has('xl/worksheets/sheet2.xml'));
    const multi = openPackage(GL, GL.buildGroupXlsx(ctxFor({ cls: 'multi' })));
    assert.ok(multi.text.get('xl/worksheets/sheet1.xml').includes('>班級<') && multi.text.get('xl/worksheets/sheet2.xml').includes('3B '));
});

test('座位表 Word／Excel：傳統座位', () => {
    const c = ctxFor({ cls: 'multi', n: 30, g: 8 });
    c.seat = { mode: 'trad', cfg: { cols: 8, depth: 4, layout: 'block', aisleAfter: [4], off: ['8,4'] } };
    const w = docText(openPackage(GL, GL.buildSeatDocx(c)));
    assert.ok(w.includes('w:orient="landscape"') && w.includes('講台（前方）') && w.includes('diagStripe') && w.includes('w:val="dashed"') && w.includes('w:hRule="exact"'), '列高固定，保證一頁');
    assert.ok(w.includes('第 8 排') && w.includes('座位右上角是「排-位置」座標'));
    const x = openPackage(GL, GL.buildSeatXlsx(c));
    assert.ok(x.text.get('xl/workbook.xml').includes('name="座位表"') && !x.files.has('xl/worksheets/sheet2.xml'), '只有一張工作表（一頁）');
    const s1 = x.text.get('xl/worksheets/sheet1.xml');
    assert.ok(s1.includes('orientation="landscape"') && s1.includes('fitToWidth="1" fitToHeight="1"') && s1.includes('<mergeCell ref="A1:J1"/>'));
    assert.ok(s1.includes('>班級<') && s1.includes('座位（排-位置）'), '座位清單放在列印範圍之外（座位表下方）');
    assert.match(x.text.get('xl/workbook.xml'), /Print_Area"[^>]*>[^<]*\$A\$1:\$J\$\d+</);
    c.options = { coord: false, color: false };
    const w2 = docText(openPackage(GL, GL.buildSeatDocx(c)));
    assert.ok(!w2.includes('座位右上角') && !/>\d-\d</.test(w2));
    assert.ok(!w2.includes('E6EEFB'), '不保留顏色時沒有組別色');
});

test('座位表 Word／Excel：分組座位（含示意圖）', () => {
    const c = ctxFor({ n: 20, g: 5 });
    c.seat = { mode: 'table', tables: [{ n: 8, shape: 'rect' }, { n: 8, shape: 'rect', ord: 'face' }, { n: 6, shape: 'hex' }], perRow: 2, image: { data: tinyPng(GL), width: 4, height: 2 } };
    const p = openPackage(GL, GL.buildSeatDocx(c));
    assert.ok(p.files.has('word/media/image1.png'));
    assert.ok(docText(p).includes('r:embed="rIdImg1"') && docText(p).includes('桌 3'));
    const x = openPackage(GL, GL.buildSeatXlsx(c));
    assert.ok(x.text.get('xl/worksheets/sheet1.xml').includes('桌 1（第 1、2 組）'));
    delete c.seat.image;
    assert.ok(!openPackage(GL, GL.buildSeatDocx(c)).files.has('word/media/image1.png'));
});

test('buildDownload：回傳檔名與 MIME', () => {
    const c = ctxFor({ cls: 'one' });
    const r = GL.buildDownload('group', 'xlsx', c);
    assert.equal(r.fileName, '3A_分組名單_2026-11-21.xlsx');
    assert.equal(r.mime, GL.MIME.xlsx);
    assert.ok(r.bytes.length > 1000);
});

// 需要時輸出樣本檔給 Word／Excel 實際開啟（tests/office-open-check.ps1 使用）
if (process.env.GROUP_SAMPLES_DIR) {
    test('輸出樣本檔', () => {
        const dir = process.env.GROUP_SAMPLES_DIR;
        fs.mkdirSync(dir, { recursive: true });
        const cases = [['one', { cls: 'one' }], ['multi', { cls: 'multi' }], ['noscore', { scores: false }], ['skip', { cls: 'one', skip: true }]];
        cases.forEach(([tag, o]) => {
            const c = ctxFor(o);
            if (o.skip) c.groups = plain(c.groups).map(g => g.filter(i => i !== 1 && i !== 9 && i !== 20)); // 缺成績略過的人：不在任何一組
            c.seat = { mode: 'trad', cfg: { cols: 8, depth: 4, layout: 'block', aisleAfter: [4] } };
            ['docx', 'xlsx'].forEach(fmt => ['group', 'seat'].forEach(kind => {
                const r = GL.buildDownload(kind, fmt, c);
                fs.writeFileSync(path.join(dir, tag + '-trad-' + r.fileName), r.bytes);
            }));
            c.seat = { mode: 'table', tables: [{ n: 8, shape: 'rect' }, { n: 8, shape: 'rect', ord: 'face' }, { n: 8, shape: 'rect' }, { n: 8, shape: 'rect' }], perRow: 2, image: { data: tinyPng(GL), width: 4, height: 2 } };
            ['docx', 'xlsx'].forEach(fmt => { const r = GL.buildDownload('seat', fmt, c); fs.writeFileSync(path.join(dir, tag + '-table-' + r.fileName), r.bytes); });
        });
    });
}

/* ── v3.5.2：對照修正（#4 未分組一行、D3 Excel 橫式一頁寬、D5 頁尾頁碼字級）── */
function buildPkg(fmt, ctx) {
    const r = GL.buildDownload('group', fmt, Object.assign({ method: 'snake', date: DATE }, ctx));
    return openPackage(GL, r.bytes);
}
const skipCtx = n => {
    const roster = makeRoster(n);
    const ids = roster.map((_, i) => i).filter(i => i !== 1 && i !== 4); // 第 1、4 位缺成績、略過：沒放進任何一組
    return { roster, groups: [ids.slice(0, 4), ids.slice(4)], names: [roster[1].name, roster[4].name] };
};
const paraTexts = pk => Array.from(pk.text.get('word/document.xml').matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)).map(m => m[1]);

test('#4 Word：略過的同學在名單最後列成「未分組：姓名、姓名」（每一頁都有）；沒有人就不出現', () => {
    const c = skipCtx(8), line = '未分組：' + c.names.join('、');
    const pk = buildPkg('docx', c);
    const t = paraTexts(pk);
    assert.equal(t.filter(x => x === line).length, 2, '含成績與不含成績兩頁各一行');
    const total = t.findIndex(x => /^共 6 人/.test(x));
    assert.ok(total >= 0 && t[t.indexOf(line)] === line && t.indexOf(line) > total, '在「共 N 人」之後（名單最後）');
    const all = makeRoster(6);
    const none = buildPkg('docx', { roster: all, groups: [[0, 1, 2], [3, 4, 5]] });
    assert.ok(!paraTexts(none).some(x => x.startsWith('未分組')), '沒有人略過就不加');
});

test('#4 Excel：含成績與不含成績兩張工作表最後都有「未分組」一行；多班時姓名前加班級', () => {
    const c = skipCtx(8), line = '未分組：' + c.names.join('、');
    const pk = buildPkg('xlsx', c);
    ['sheet1', 'sheet2'].forEach(s => {
        const x = pk.text.get('xl/worksheets/' + s + '.xml');
        assert.ok(x.includes('>' + line + '<'), s + ' 有未分組一行');
        assert.match(x, /<mergeCell ref="A\d+:[A-Z]+\d+"\/>/, s + ' 合併成整列寬');
    });
    const none = buildPkg('xlsx', { roster: makeRoster(6), groups: [[0, 1, 2], [3, 4, 5]] });
    assert.ok(![...none.text.values()].some(x => x.includes('未分組')));
    const m = makeRoster(8, { cls: 'multi' });
    const mp = buildPkg('xlsx', { roster: m, groups: [[0, 2, 4, 6], [1, 3, 5]] });
    assert.ok(mp.text.get('xl/worksheets/sheet1.xml').includes('>未分組：3B ' + m[7].name + '<'));
});

test('D3 Excel 分組名單：每張工作表各自縮成一頁（fitToWidth=1、fitToHeight=1），並設定列印範圍', () => {
    const c = skipCtx(8);
    const check = (pk, n) => {
        for (let i = 1; i <= n; i++) {
            const x = pk.text.get('xl/worksheets/sheet' + i + '.xml');
            assert.ok(x.includes('<pageSetUpPr fitToPage="1"/>'), 'sheet' + i);
            assert.match(x, /<pageSetup [^>]*orientation="(landscape|portrait)"[^>]*fitToWidth="1" fitToHeight="1"\/>/, 'sheet' + i);
        }
        assert.equal((pk.text.get('xl/workbook.xml').match(/_xlnm\.Print_Area/g) || []).length, n, '每張工作表一個列印範圍');
        assert.ok(!pk.text.has('xl/worksheets/sheet' + (n + 1) + '.xml'));
    };
    check(buildPkg('xlsx', c), 2);
    const ns = makeRoster(8, { scores: false });
    check(buildPkg('xlsx', { roster: ns, groups: [[0, 1, 2, 3], [4, 5, 6, 7]] }), 1);
});

test('D5 Word 頁尾：頁碼用完整欄位，每個片段都是 8pt，與文字同大小', () => {
    const f = buildPkg('docx', skipCtx(8)).text.get('word/footer1.xml');
    assert.ok(!f.includes('fldSimple'), '不用 fldSimple（Word 更新後數字會退回預設字級）');
    assert.equal((f.match(/fldCharType="begin"/g) || []).length, 2);
    assert.ok(f.includes('> PAGE \\* MERGEFORMAT <'));
    assert.ok(f.includes('> NUMPAGES \\* MERGEFORMAT <'));
    const runs = f.match(/<w:r>.*?<\/w:r>/g);
    assert.ok(runs.length >= 11);
    runs.forEach(r => assert.match(r, /<w:sz w:val="16"\/>/, r));
});

/* ── v3.7.0：每一件事都只印一頁（含成績、不含成績各一頁；座位表一頁；Word、Excel；各種選項）── */
function splitGroups(n, g) { const ids = [...Array(n).keys()], out = []; let p = 0; GL.groupSizes(n, g).forEach(s => { out.push(ids.slice(p, p + s)); p += s; }); return out; }
const oneCtx = (n, g, ro, options, extra) => Object.assign({ roster: makeRoster(n, ro), groups: splitGroups(n, g), method: 'snake', date: DATE, appVersion: 'v9.9', options: options || {} }, extra || {});
const onePageSeats = [
    { mode: 'trad', cfg: { cols: 12, depth: 6, layout: 'block', aisleAfter: [4, 8] } },
    { mode: 'trad', cfg: { cols: 30, depth: 2, layout: 'col', off: ['3,1'] } },
    { mode: 'table', tables: [{ n: 8, shape: 'rect' }, { n: 8, shape: 'rect', ord: 'face' }, { n: 8, shape: 'hex' }, { n: 8, shape: 'rect', one: true }], perRow: 2 },
    { mode: 'table', tables: Array.from({ length: 16 }, () => ({ n: 4, shape: 'rect' })), perRow: 4, image: true }
];

test('一件事一頁：分組名單 Word 每件事從新的一頁開始，排得下就一頁、沒有手動分頁、方塊列高固定', () => {
    [[8, 2, {}], [30, 5, { cls: 'one' }], [64, 16, { cls: 'multi' }], [100, 25, { cls: 'multi' }], [64, 16, { scores: false }]].forEach(([n, g, ro]) => {
        [{}, { withoutScore: false }, { withScore: false }, { color: false, showAvg: false }].forEach(op => {
            const c = oneCtx(n, g, ro, op), things = GL.groupPages({ hasScores: ro.scores !== false }, Object.assign({ withScore: true, withoutScore: true }, op)).length;
            const d = docText(openPackage(GL, GL.buildGroupDocx(c)));
            assert.equal((d.match(/<w:sectPr>/g) || []).length, things, n + '人 ' + JSON.stringify(op) + '：這些情境每件事剛好一頁');
            assert.ok(!/w:pageBreakBefore|<w:br w:type="page"\/>/.test(d), '沒有手動分頁');
            assert.ok(/w:hRule="exact"/.test(d) && !/w:hRule="atLeast"/.test(d), '列高固定');
        });
    });
});

test('一件事一頁：字級降到可讀下限（8pt）仍放不下才分頁，每一組整組留在同一頁、不會斷在中間', () => {
    const c = oneCtx(300, 30, { cls: 'multi' }), rep = GL.fitReport('group', c);
    assert.ok(rep.docx.pages > 2 && rep.docx.small, '300 人 30 組兩件事合計超過兩頁：' + JSON.stringify(rep.docx));
    assert.ok(rep.docx.font >= GL.F_MIN, '字級不低於可讀下限 ' + GL.F_MIN);
    const d = docText(openPackage(GL, GL.buildGroupDocx(c)));
    assert.equal((d.match(/<w:sectPr>/g) || []).length, rep.docx.pages, '區段數＝預估頁數');
    for (let g = 1; g <= 30; g++) assert.equal((d.match(new RegExp('>第 ' + g + ' 組<', 'g')) || []).length, 2, '第 ' + g + ' 組在含成績、不含成績各出現一次（整組在同一頁）');
    assert.ok(d.includes('（1／') && d.includes('（接下一頁）'));
    // 單件事也一樣：150 人 30 組只含成績 → 字級 8、兩頁
    const one = GL.fitReport('group', oneCtx(150, 30, { cls: 'multi' }, { withoutScore: false }));
    assert.ok(one.docx.pages >= 2 && one.docx.font === GL.F_MIN, JSON.stringify(one.docx));
});

test('一件事一頁：64 人 16 組每件事都是一頁，字級不低於 8pt', () => {
    const r = GL.fitReport('group', oneCtx(64, 16, { cls: 'multi' }));
    assert.equal(JSON.stringify(r.docx.perThing), '[1,1]'); assert.equal(JSON.stringify(r.xlsx.perThing), '[1,1]');
    assert.ok(r.docx.font >= GL.F_MIN && r.xlsx.font >= GL.F_MIN, JSON.stringify(r));
    assert.ok(!r.docx.small && !r.xlsx.small);
});

test('一件事一頁：分組名單 Excel 每件事一張工作表；排得下用「縮成一頁」，排不下改成縮放＋在方塊列之間手動分頁', () => {
    [[8, 2, {}], [64, 16, { cls: 'multi' }], [100, 25, { cls: 'one' }], [30, 5, { scores: false }]].forEach(([n, g, ro]) => {
        [{}, { withoutScore: false }, { withScore: false }, { showAvg: false }].forEach(op => {
            const things = GL.groupPages({ hasScores: ro.scores !== false }, Object.assign({ withScore: true, withoutScore: true }, op)).length;
            const pk = openPackage(GL, GL.buildGroupXlsx(oneCtx(n, g, ro, op)));
            for (let i = 1; i <= things; i++) assert.ok(pk.text.get('xl/worksheets/sheet' + i + '.xml').includes('fitToWidth="1" fitToHeight="1"'));
            assert.ok(!pk.files.has('xl/worksheets/sheet' + (things + 1) + '.xml'));
            assert.equal((pk.text.get('xl/workbook.xml').match(/_xlnm\.Print_Area/g) || []).length, things);
        });
    });
    const big = openPackage(GL, GL.buildGroupXlsx(oneCtx(300, 30, { cls: 'multi' })));
    const s1 = big.text.get('xl/worksheets/sheet1.xml');
    assert.ok(/<pageSetup [^>]*scale="\d+"/.test(s1) && !s1.includes('fitToPage') && s1.includes('<rowBreaks '), '分頁用縮放＋手動分頁（fitToPage 會忽略手動分頁）');
    const brks = [...s1.matchAll(/<brk id="(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(brks.length >= 1 && brks.every((v, i) => i === 0 || v > brks[i - 1]));
});

test('一頁為限：座位表 Word（傳統座位、方桌／長桌／六邊形桌）一個區段、橫式、無分頁；Excel 一張工作表 fit 1×1', () => {
    onePageSeats.forEach(seat => {
        [{}, { color: false, coord: false }].forEach(op => {
            const c = oneCtx(64, 16, { cls: 'multi' }, op, { seat: Object.assign({}, seat) });
            if (seat.image) c.seat.image = { data: tinyPng(GL), width: 1200, height: 800 };
            const d = docText(openPackage(GL, GL.buildSeatDocx(c)));
            assert.equal((d.match(/<w:sectPr>/g) || []).length, 1);
            assert.ok(d.includes('w:orient="landscape"') && !/w:type="page"|w:pageBreakBefore/.test(d));
            assert.ok(!/w:hRule="atLeast"/.test(d), '列高固定');
            const x = openPackage(GL, GL.buildSeatXlsx(c));
            assert.ok(!x.files.has('xl/worksheets/sheet2.xml'));
            const s = x.text.get('xl/worksheets/sheet1.xml');
            assert.ok(s.includes('fitToWidth="1" fitToHeight="1"'));
            assert.match(x.text.get('xl/workbook.xml'), /Print_Area"[^>]*>[^<]*\$A\$1:\$[A-Z]+\$\d+</);
        });
    });
});

test('一頁為限：座位表字級預估（fitReport）與提示門檻', () => {
    const ok = GL.fitReport('seat', oneCtx(64, 16, { cls: 'multi' }, {}, { seat: onePageSeats[0] }));
    assert.ok(ok.docx.font >= GL.F_MIN, JSON.stringify(ok));
    const wide = GL.fitReport('seat', oneCtx(60, 10, { cls: 'multi' }, {}, { seat: { mode: 'trad', cfg: { cols: 30, depth: 2, layout: 'col' } } }));
    assert.ok(typeof wide.docx.small === 'boolean' && typeof wide.xlsx.small === 'boolean');
});

test('一頁為限：排座位模式的 Excel（gridXlsx）一張工作表、fit 1×1、清單在列印範圍外', () => {
    const layout = [['高三３班座位表'], ['○○中學'], ['深位 2', '甲', '乙'], ['深位 1', '丙', ''], ['深位 \ 橫排', '第 1 排', '第 2 排'], ['講台', '', '']];
    const kinds = ['text', 'text', 'grid', 'grid', 'label', 'front'];
    const pk = openPackage(GL, GL.gridXlsx(layout, kinds, [['學生姓名', '狀態'], ['甲', '已定位']], 3, DATE));
    assert.ok(!pk.files.has('xl/worksheets/sheet2.xml'));
    const s = pk.text.get('xl/worksheets/sheet1.xml');
    assert.ok(s.includes('fitToWidth="1" fitToHeight="1"') && s.includes('學生姓名'));
    assert.match(pk.text.get('xl/workbook.xml'), /Print_Area"[^>]*>[^<]*\$A\$1:\$C\$6</);
});
