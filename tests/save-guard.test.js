// saveData 例外防護測試（jsdom）。執行：node --test tests/
// 需要 jsdom：沒有就跳過（npm install --no-save jsdom，或設 JSDOM_PATH）。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom')); } catch (e) { JSDOM = null; }
const skip = JSDOM ? false : '沒有安裝 jsdom，跳過';

async function load(file) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const vc = new VirtualConsole();
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', url: 'http://localhost/index.html', virtualConsole: vc, pretendToBeVisual: true,
        beforeParse(w) {
            w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
            w.scrollTo = () => {};
            w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        }
    });
    const w = dom.window;
    await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
    return w;
}

for (const file of ['index.html', 'seat_helper.html']) {
    test(file + '：localStorage 寫入丟例外時 saveData 不中斷並顯示儲存失敗', { skip }, async () => {
        const w = await load(file);
        w.Storage.prototype.setItem = function () { throw new w.DOMException('quota', 'QuotaExceededError'); };
        assert.doesNotThrow(() => w.saveData());
        const t = w.document.getElementById('copySuccess');
        assert.match(t.textContent, /儲存失敗/);
        assert.equal(t.style.display, 'block');
        assert.doesNotThrow(() => w.toggleTheme());
    });
    test(file + '：寫入正常時照常存檔、不出現失敗提示', { skip }, async () => {
        const w = await load(file);
        w.saveData();
        assert.ok(w.localStorage.getItem('seatHelperDataV2'));
        assert.doesNotMatch(w.document.getElementById('copySuccess').textContent, /儲存失敗/);
    });
}
test('兩份 HTML 內容完全相同，且有版號', () => {
    const a = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.equal(a, fs.readFileSync(path.join(ROOT, 'seat_helper.html'), 'utf8'));
    assert.match(a, /APP_VERSION = "v\d+\.\d+\.\d+"/);
});
