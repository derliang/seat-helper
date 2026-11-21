# 施工A：分組邏輯層（給施工B與之後維護的人）

> 建立：2026-11-21（台北時間），分支 `feat-group-logic`。規格來源：`docs/design/DESIGN.md` 第 10 節、`docs/design/mockups/分組功能.html`。

## 放在哪裡

- `index.html`（與 `seat_helper.html` 相同）裡的 `<script id="group-logic">`，在主程式 `<script>`（`APP_VERSION` 那段）之前。
- 對外只有一個全域物件 `window.GroupLogic`；這段不碰 DOM，畫面由施工B接上。
- .docx／.xlsx 用自寫的最小 zip（不壓縮）封裝，沒有新增任何第三方函式庫，部署白名單不用改（DESIGN.md 10.6）。

## 資料格式

- 名單 `roster = [{ cls, no, name, score }]`（班級、座號、姓名、成績；成績可為數字或數字字串，空白＝沒有）。
- 分組 `groups = [[名單索引, …], …]`，第 0 組＝「第 1 組」。
- 過去的分組（避免同組用）存成 `[[studentKey, …], …]`，`studentKey(st)`＝「班級|座號|姓名」。

## 主要函式

| 用途 | 函式 |
|---|---|
| 智慧判斷（有無成績、班級 none／one／multi） | `analyzeRoster(roster)` |
| 按成績前找出缺成績的人 | `missingScores(roster)` → 索引陣列 |
| 組數 | `resolveGroupCount(人數, 'count'|'size', 值)` → `{ count, sizes, clamped }` |
| 分組（含避免同組） | `groupRoster(roster, { method: 'random'|'snake'|'round'|'balanced', count, avoid: [過去分組…], indices?, seed? })` → `{ groups, repeats, notice }` |
| 各組平均、最高最低差 | `groupAverages(groups, roster)`、`spreadOf(avgs)` |
| 與上次同組的重複對數 | `repeatPairs(groups, avoid)` → `{ pairs, pairCount, groupCount }`（成員要與 avoid 同一種 id） |
| 傳統座位對應 | `tradSeatMap({ cols, depth, layout: 'block'|'row'|'col', off: ['排,位置'], aisleAfter: [排號] }, groups)` → `{ cells, needed, available, lack }` |
| 分組座位（桌子）對應 | `tableSeatMap([{ n, shape: 'rect'|'round'|'hex', one, ord: 'side'|'face' }], groups)` → `{ tables, needed, available, lack }` |
| 下載（四份檔案） | `buildDownload('group'|'seat', 'docx'|'xlsx', ctx)` → `{ bytes, fileName, mime }` |

`ctx = { roster, groups, method, date, appVersion, options, seat, layoutLabel? }`：

- `options`：`withScore`、`withoutScore`（含成績頁／不含成績頁）、`showAvg`、`color`（保留組別顏色）、`coord`（顯示座標），預設都開。兩頁都關時 `buildGroupDocx／Xlsx` 會丟出「請至少選一頁」。
- `seat`：傳統座位 `{ mode: 'trad', cfg }`；分組座位 `{ mode: 'table', tables, perRow 每列幾張桌, image: { data: PNG 位元組, width, height } }`。座位表 Word 的桌子示意圖由畫面把畫布轉成 PNG 傳進來；沒給就只有每桌名單。
- 座位不夠（`lack > 0`）時仍可產生檔案，停用下載按鈕是畫面的事（DESIGN.md 10.3a）。
- 下載：`new Blob([r.bytes], { type: r.mime })` 再交給主程式既有的 `downloadBlob(blob, r.fileName)`。

## 實作時替使用者決定的事（需要時可改）

1. **依每組人數分組**：組數＝人數 ÷ 每組人數，無條件進位（沒有一組超過指定人數）。例：30 人、每組 4 人 → 8 組（4,4,4,4,4,4,3,3）。
2. **組數大於人數**：自動降為「人數」組、每組 1 人，`resolveGroupCount` 回傳 `clamped: true` 讓畫面提示。
3. **S 型、總平均一致的最後一輪反向時**：多出來的人會落在後面幾組，程式把大組重新編到前面，符合「前幾組多 1 人」。
4. **座位塊大小**：橫排一段／直排一段＝每組佔「最多人那組」個座位；2×2 方塊＝前後 2 個位置 × ⌈最多人數÷2⌉ 排（4 人＝2×2；5 人＝2×3，空 1 格）。桌子也是每組佔「最多人那組」個連續座位。設為不排的座位直接跳過。
5. **避免同組做不到的提示文字**（設計對照時確認）：「有 N 組無法完全避開上次的同組（共 M 對再度同組）」；比對最近 3 次時寫「最近 3 次」。完全避開時是空字串。
6. **有無成績**：只要有一個人有成績就算「名單有成績」。**班級**：只有一個班級名稱（其他人空白）也算同一班。
7. **檔名沒有班級**：不加前綴（`分組名單_2026-11-21.docx`），照 10.3a 智慧判斷與派工單；DESIGN.md 10.3a 下載介面那段還寫著「名單沒有班級時用『座位小幫手』」，兩處矛盾，**待調度員請使用者確認後改 DESIGN.md**。
8. **排法名稱**：DESIGN.md 寫「橫排一段／直排一段」，模擬頁寫「橫向一段／縱向一段」，程式預設用 DESIGN.md；畫面可用 `ctx.layoutLabel` 覆蓋。
9. **組內排序**：先班級（多班時）再座號。
10. **字型**：Word／Excel 都用微軟正黑體（Microsoft JhengHei）。
11. 分組名單的組別色也跟著 `options.color`（預設開）。

## 不在施工A範圍（施工B或之後）

- 貼上名單的欄位自動判斷與解析表、「自動加入座號」。
- 分組紀錄（自動儲存最近 10 筆）、互換組員與復原／重做（50 步）、調整紀錄。
- 桌子畫布轉 PNG（給座位表 Word 的示意圖）。
- 所有畫面、下載卡片的四種狀態、版號。

## 測試

- `node --test tests/group-logic.test.js`：20 項，涵蓋人數不整除、組數大於人數、避免同組做得到／做不到、三種成績分組、缺成績、有無成績、一班／多班／無班級、檔名、座位塊、桌子面對面、zip CRC、四份檔案解壓與 XML 結構，並確認兩份 HTML 相同。
- `pwsh -NoProfile -File tests\office-open-check.ps1 [-Pdf]`：用本機 Word／Excel 實際開啟 18 個樣本檔（需 Office，不在自動測試內）；`-Pdf` 另存 PDF 供目視檢查版面。
