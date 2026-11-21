# 研究E 階段二：成績檔智慧匯入（施工進度）

> 交接用。規格：`docs/dispatch/成績匯入研究.md` 7.5（純邏輯）、`docs/design/DESIGN.md` 10.1a 與模擬頁⑨（畫面）。分支 `feat-score-import`（從 main v3.5.2 開）。

## 已完成

- **純邏輯 `window.ScoreImport`**：`index.html`／`seat_helper.html` 的 `<script id="score-import">`（在 `group-logic` 之後），照 7.5.2 的分層函式實作，另加 `analyzeSheet`、`sameColumnKeys`（介面改一欄角色時，其他區塊／工作表同位置同欄名的欄一起改）。
- **測試** `tests/score-import.test.js`：T1–T20 全部捏造假名假成績，另有 override、邊界、`fromSheetJS`（要 SheetJS：`npm install --no-save xlsx@0.18.5`，或設 `XLSX_PATH`；沒有就跳過）。`tests/helpers.js` 新增 `loadScripts(ids)`。
- **本機用兩份真實檔驗證**（只在本機，結果只看結構）：檔案甲預選 2 張班級表、68 人、標題列第 3 列、比重列第 2 列、略過第 37 列統計列；檔案乙只選彙總表（兩區塊 68 人），另 4 張標為重複；兩份都餵得進 `groupRoster`。

## 與 7.5 計畫的差異（實作時決定）

- 合併方式依裁示改為 `right`（只取最右，預設）／`mean`／`weighted`；自動判斷時，總成績欄與它左邊的成績候選都標「成績」，右邊的標「略過」，所以「只取最右」一定取到總成績。
- `opts.override.roles` 的值用代碼：`cls`、`no`、`name`、`score`、`group`、`skip`；`headerRow` 用第幾列（從 1 起，0＝沒有標題）。
- 找標題列時同分取**上面**那列（研究報告原寫取下面）：橫幅只有一格不會同分，取下面反而可能把資料中間的重複標題列當標題。
- 一張工作表都沒有人時，仍選第一張有資料的表，讓「找不到姓名欄」這類提醒出現。
- `decodeCsv` 回傳字串（UTF-8 嚴格失敗才改 Big5）。

## 進行中／未完成

- 介面接線（10.1a 全部元素）、版號 v3.6.0、README 一筆、截圖自查、PR、回報調度員。
