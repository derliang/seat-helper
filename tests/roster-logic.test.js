// 後台學生名單純邏輯測試（DESIGN.md §13）。執行：node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers');

// vm 內的陣列與這裡不同 realm，先轉成一般 JSON 再比
const plain = v => JSON.parse(JSON.stringify(v));

for (const file of ['index.html', 'seat_helper.html']) {
    const R = loadScripts(['roster-logic'], file).RosterLogic;

    test(file + '：三個選項的切換規則', () => {
        const none = { skip8: false, skip9: [] };
        assert.deepEqual(plain(R.toggle(none, 's8')), { skip8: true, skip9: [] });
        assert.deepEqual(plain(R.toggle(none, 'all9')), { skip8: false, skip9: [1, 2, 3, 4, 5] }, '不上9 一下五天');
        assert.deepEqual(plain(R.toggle({ skip8: false, skip9: [1, 2, 3, 4, 5] }, 'all9')), none, '再按一次取消');
        assert.deepEqual(plain(R.toggle({ skip8: false, skip9: [1, 2, 3, 4, 5] }, 'd3')), { skip8: false, skip9: [1, 2, 4, 5] }, '點掉一天變部分天數');
        assert.deepEqual(plain(R.toggle({ skip8: false, skip9: [3] }, 'd1')), { skip8: false, skip9: [1, 3] });
        assert.deepEqual(plain(R.toggle({ skip8: true, skip9: [2] }, 'all9')), { skip8: true, skip9: [2] }, '不上8·9 時第九節鎖住');
        assert.deepEqual(plain(R.toggle({ skip8: true, skip9: [2] }, 'd4')), { skip8: true, skip9: [2] });
        assert.deepEqual(plain(R.toggle({ skip8: true, skip9: [2] }, 's8')), { skip8: false, skip9: [2] }, '取消不上8·9 保留原本的星期');
    });

    test(file + '：八九節文字的解析與輸出', () => {
        assert.equal(R.parseAtt(''), null);
        assert.equal(R.parseAtt('   '), null);
        for (const t of ['無89', '無8·9', '無8,9', '不上89', '無八九', '８９不上']) assert.deepEqual(plain(R.parseAtt(t)), { skip8: true, skip9: [] }, t);
        for (const t of ['無9', '不上第九節', '無9全部']) assert.deepEqual(plain(R.parseAtt(t)), { skip8: false, skip9: [1, 2, 3, 4, 5] }, t);
        assert.deepEqual(plain(R.parseAtt('無9 一三')), { skip8: false, skip9: [1, 3] });
        assert.deepEqual(plain(R.parseAtt('無9 週三、週一')), { skip8: false, skip9: [1, 3] });
        assert.deepEqual(plain(R.parseAtt('無9 1 3')), { skip8: false, skip9: [1, 3] });
        assert.equal(R.parseAtt('無9 六'), undefined);
        assert.equal(R.parseAtt('請假'), undefined);
        assert.equal(R.attText(true, []), '無89');
        assert.equal(R.attText(false, [1, 2, 3, 4, 5]), '無9');
        assert.equal(R.attText(false, [3, 1]), '無9 一三');
        assert.equal(R.attText(false, []), '');
        for (const [s8, s9] of [[true, []], [false, [1, 2, 3, 4, 5]], [false, [2, 5]]]) {
            assert.deepEqual(plain(R.parseAtt(R.attText(s8, s9))), { skip8: s8, skip9: s8 ? [] : s9 }, '輸出再讀回來一致');
        }
    });

    test(file + '：從 Excel 貼上：更新、新增、錯誤行', () => {
        const existing = [{ seatNo: 1 }, { seatNo: 2 }, { seatNo: 3 }, { seatNo: 7 }];
        const raw = ['座號\t姓名\t身高\t八九節', '1\t林家豪\t168\t', '2\t陳怡君\t155\t無9 一三', '3\t張書維\t172\t無89', '7\t黃柏翰\t1六5\t', '33\t吳佳穎\t160\t無9', ''].join('\n');
        const rows = plain(R.parsePaste(raw, existing));
        assert.equal(rows.length, 5, '標題列與空行略過');
        assert.deepEqual(rows.map(r => r.action), ['update', 'update', 'update', 'error', 'add']);
        assert.equal(rows[0].height, 168);
        assert.equal(rows[0].skip8, undefined, '八九節空白＝不改動');
        assert.deepEqual([rows[1].skip8, rows[1].skip9], [false, [1, 3]]);
        assert.equal(rows[2].skip8, true);
        assert.match(rows[3].error, /身高「1六5」不是數字/);
        assert.deepEqual([rows[4].name, rows[4].height, rows[4].skip9], ['吳佳穎', 160, [1, 2, 3, 4, 5]]);
    });

    test(file + '：從 Excel 貼上：空白分隔、省略欄位與各種錯誤', () => {
        const rows = plain(R.parsePaste('5 王冠宇 無9\n6 劉品妍\n8 許雅筑 161 無89\n0 沒座號\n9\n6 重複\n10 太高 300\n11 奇怪 165 請假', []));
        assert.deepEqual(rows.map(r => r.action), ['add', 'add', 'add', 'error', 'error', 'error', 'error', 'error']);
        assert.deepEqual([rows[0].heightText, rows[0].skip9], ['', [1, 2, 3, 4, 5]], '省略身高、直接寫八九節');
        assert.equal(rows[1].height, undefined);
        assert.deepEqual([rows[2].height, rows[2].skip8], [161, true]);
        assert.match(rows[3].error, /不是正整數/);
        assert.match(rows[4].error, /沒有姓名/);
        assert.match(rows[5].error, /重複/);
        assert.match(rows[6].error, /80 到 250/);
        assert.match(rows[7].error, /看不懂/);
    });
}
