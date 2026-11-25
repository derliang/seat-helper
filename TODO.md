# TODO／巡檢記錄

## 版權維護規範（2026-10-24 版權任務導入）

- **現況**：根目錄 `LICENSE.md`（限制性授權；v3.2.3 以前舊版本的 MIT 效力保留）、README「授權條款」、`index.html`／`seat_helper.html` 檔頭版權註解（頁面不顯示版權句）。授權政策：○○中學師生免費、**所有使用者限非營利**、其他學校須寄信 derliang@gmail.com 並取得作者 Email 明確同意。
- **後續開發守則**：`index.html` 與 `seat_helper.html` 必須同步修改（含檔頭版權註解），不得只改一份；不得移除或改寫版權標示；不得把授權改回 MIT；`vendor/` 第三方檔案與其授權原樣保留。
- **UI 限制（2026-10-25 更新）**：頁面不顯示任何版權文字，版權標示只放在 `index.html`／`seat_helper.html` 原始碼最頂端的 HTML 註解（`<!DOCTYPE html>` 與 `<html>` 之後、`<head>` 之前，三行：Copyright、Non-commercial use only. See LICENSE.md.、Authorization inquiries），以免影響程式 UI 與匯出的圖片、PDF。授權全文只維持 `LICENSE.md`，不另做站內授權頁。
- **已確認事項（2026-10-24）**：著作權人為「derliang」（公開識別 derliang，舊 README 曾寫「座位小幫手團隊」）；舊 MIT 版本以 commit `218764b` 為界，已標 git tag `v3.2.3-mit`。

## 2026-10-24 版權任務（已完成，不改功能、不改版號）

新增 `LICENSE.md`、README 授權條款改寫、頁尾版權句、檔頭註解；舊 MIT 版本分界寫入 `LICENSE.md`。

## 2026-10-17 程式巡檢（v3.2.2）

**做法**：整份 `index.html` 讀完（CSS、HTML、JS），先把發現列給使用者、經同意後才改；改完抽出內嵌 JS 跑 `node --check`，再用 `npx serve` 起本機 HTTP、在瀏覽器用腳本化情境逐項驗證；最後 `cp index.html seat_helper.html` 同步離線交付檔。

**修了什麼**（詳見 README v3.2.2）：

| 項目 | 位置 | 驗證 |
|---|---|---|
| 改橫排數時禁排／指定座位錯位、被丟掉座位的學生 `currentPos` 殘留 | `initGrid`、新增 `syncStudentPositions` | 7→8→4 排：禁排 3-2 留在 3-2，指定 5-1 在 4 排時被丟掉且學生回到待抽 |
| 後台「依座號排序」後主頁需求按鈕套錯人 | `sortHeightData` 補 `updateUI` | 反轉名單再排序，第一列按鈕索引對上 `students[0]` |
| 歷史紀錄還原／匯出不帶該筆 `gridConfig`；匯出用 600ms 計時器還原 | 新增 `applySeatRecord`、`captureSeatState`、`restoreSeatState`；`exportHistoryRecord` 改 async | 5×5 還原 7×7 紀錄 → 格子數、座標、輸入框都回 7×7；匯出 Excel 時是紀錄的格子，匯完狀態完全還原 |
| 重匯名單後舊指定座位殘留、同一人可被抽到第二個座位 | `btnInit` 只留新名單找得到的指定座位，`initGrid` 同步 `currentPos` | 同名單重匯 → 已定位 1；不同名單 → 舊座位清空 |
| 抽籤中仍可改座位／行列／名單 | 新增 `guardDrawing`，用在 `handleSeatClick`、`initGrid`、`btnInit`、`clearStudentList`、`toggleTag`、`clearAllTags`、`btnResetDraw`、`btnResetAll`、`restoreHistoryRecord`、`exportHistoryRecord`、`importJsonBackup` | 其他人階段進行中：點座位不開選單並出 toast、行列輸入框回復、匯入被擋 |
| `lucide` 載入失敗整站掛掉；`@latest` 未鎖版 | `initIcons` 加 `typeof` 守門；`<script>` 鎖 `lucide@1.59.0`（巡檢當天 `@latest` 解析到的版本） | `window.lucide = undefined` 後 `initGrid`／`updateUI` 不丟例外 |
| PDF 固定 190mm 寬、排數多被裁 | `buildPdfBlob` 依比例塞進 A4，寬圖自動橫向 | 15 排 → A4 直式，整張在頁內 |
| 複製圖片走已棄用的 `execCommand` | `copyImageToClipboard` 先試 `navigator.clipboard.write`（Promise 形式供 Safari），失敗退回舊法，再失敗下載 | 隱藏窗格沒有使用者手勢，**未做 live 驗證**，請在正式站點一次 |
| 深色模式下 PNG／PDF 是深底 | `captureSeatMapForExport` 擷取時暫時移除 `dark`、加 `export-capturing` 關過場動畫 | 深色下擷取，左上角像素 (255,255,255)，擷完 `dark` 還原 |
| 容量防呆沒算到名單外殘留座位 | `checkCapacityGuard` 改「待抽人數 vs 空位」 | 2 人待抽、1 個空位 → 擋下並提示 |
| 姓名直接塞 `innerHTML` | 新增 `escapeHtml`，用在需求表、座位卡、統計盒、身高清單 | 名字 `陳<五>` 顯示正確 |
| 全部重設沒刪自訂 Word 模板 | `btnResetAll` 呼叫 `deleteCustomWordTemplate`，確認文字補上 | 未 live 驗證（需先上傳模板） |
| 遮罩關不掉「請先處理特定需求」；禁排座位可直接指定學生；行列「+」沒上限 | `closeAllModals` 加 `closeAlert`；禁排時不列學生；`MAX_GRID_SIZE = 30` 與備份驗證一致 | 99 → 30 |
| 死 CSS | 刪掉前面被覆蓋的 `.tag-toggle` 整組、把 `.screen-bar`／`.row-label-text` 的生效值併回原定義 | 外觀不變 |

**不得被推翻的判斷**：
- 重匯名單時**保留**名字對得上的指定座位（老師常為了修錯字重匯），只清掉對不上的；這是刻意的，不是遺漏。
- 還原歷史紀錄前會跑 `rememberSeatingBeforeClear`（自動儲存開啟且全班就座時先存一筆），與「清空座位」行為一致，避免還原覆蓋掉沒存的座位表。
- 匯出一律淺色：列印用途，深色底沒有意義；畫面會閃一下淺色（不到一秒）是預期的。

**已知紅燈**：無。`node --check` 通過；瀏覽器實測無 console error。

## v3.4.0 後續觀察（2026-11-06，第八九節標示與 UI 優化）

- **驗證**：沒有自動測試框架；以瀏覽器腳本化情境驗證 42 項（筆刷四種、規則 1、需求表模式、清除名單後重新匯入帶回、備份來回與舊備份、匯出文字、Excel 欄位、PNG 擷取、併桌副標）全數通過；手機（375）版面與深淺色已目視確認。**尚未在 iPad 與正式站實測**，合併後請在正式網址點一次。
- **刻意的取捨**：標示記在姓名記憶（`attendanceMemory`），清除名單不會清掉，只有「清除標示」或「全部重設」才清；同名同姓的兩位學生會共用標示。
- **已知限制**：座位卡寬度 ≤62px 時章只顯示「無9」，星期要看統計列或匯出文字；匯出圖片寬度等於畫面上座位表寬度（既有行為），手機直接匯出會偏小。
- **待決定**：同一位學生有兩個需求（例如靠前加不靠邊）時，角標只顯示優先序最高的一個（沿用原本色點的規則）。若要兩個都顯示，需另外設計。

## 未實作建議（巡檢時發現，留待日後）

- ~~PDF 檔案很大~~ → v3.2.3 已修：原因是 jsPDF `addImage` 的 PNG 預設 `compression: 'NONE'`（7×7 一頁 17 MB）；改 `'FAST'` 後 102 KB、無損、多 0.2 秒。實測 JPEG 0.92 為 73 KB 但有損，座位表是文字所以選無損 PNG。
- `lucide.createIcons()` 每次 `updateUI` 都全頁重掃、`fitSeatNameText` 逐格量 `scrollWidth` 會反覆 reflow：46 人規模感受不到，暫不優化（使用者明令不量測）。
- `cfgCols`／`cfgRows` 同時綁 `oninput` 與 `onchange`，改一次會跑兩次 `initGrid`（各存一次 localStorage）；無害，未改。
- `drawHistory` 無上限：每筆約 2–3 KB，localStorage 5 MB 約可存上千筆，實務上不會碰到。
- ~~`saveData` 沒包 try/catch~~ → v3.5.1 已修：失敗時跳「儲存失敗」toast，不中斷流程。
- 單一 HTML 已逾 4400 行；若還要加功能，可考慮把 JS 拆出成獨立檔（仍是純靜態，GitHub Pages 無影響）。

## 2026-11-22 下載檔「一件事一頁」交接（PR #52，v3.7.1）

- **狀態**：程式、測試、設計規範 §12、README 都在分支 `export-pages-split`（PR #52），**尚未合併 main、尚未部署**（合併被權限擋下，等使用者在對話裡明確同意；正式站目前是 v3.7.0＝含成績與不含成績並排的舊版）。合併前先 `git fetch` 看有沒有人先併了（兩份 HTML 要一致、版號衝突取較新），合併後等 Deploy Pages 成功，開正式網址確認版號 v3.7.1。
- **規則**：一件事一頁（含成績／不含成績各自獨立）；排得下就一頁，字級最小 8 pt，仍放不下才分頁且每組不斷頁；座位表一張圖維持一頁。細節見 `docs/design/DESIGN.md` §12。
- **待使用者裁示**：①超大教室（例如 30 排）座位表要不要分頁；②多班名單要不要改成「一班一頁」（目前依組分頁，不依班切）。
- **驗證方式**：`tests/office-open-check.ps1`（需裝 Office）；node 測試 `node --test tests/`。排座位匯出公版（§11）仍未實作，實作時沿用 §12。

## 2026-11-25 後台學生名單與第八九節固定資料（v3.8.0，分支 `feat/backend-roster-period89`）

- **需求（使用者原話摘要）**：在後台為學生標示第八、九節（不上八九節、不上第九節、部分天數不上第九節分一至五），這是固定資料，不要每次在座位表上手動標；後台原本只有身高匯入，可重新設計；排好座位後若後台有設定要自動帶入。
- **決定**：見 `docs/design/DESIGN.md` §13（同一份名單、筆刷保留當臨時調整、先做單一名單、三種輸入方式、採 1a 表格、八九節三選項；「只不上第八節」不另設，使用者定案時確認）。
- **驗證**：`node --test tests/`（含新的 `roster-logic.test.js`）；本機瀏覽器腳本化情境：三選項切換與鎖定、改姓名搬移姓名記憶、改座號、身高與座號驗證、Excel 貼上預覽與套用、新增、刪除已就座學生、抽籤完成自動蓋章與提示、主畫面重新匯入帶回身高與八九節；桌機 1280、平板 820、手機 390、深淺色。**尚未在 iPad 實機與正式站實測**，合併部署後請在正式網址點一次。
- **刻意的取捨**：Excel 貼上只更新與新增、不刪除，空白欄位不改動原本資料（避免貼錯清掉資料）；重新匯入時身高依姓名從「目前名單」帶回，若先按「清除名單」再匯入，身高不會帶回（八九節仍會，因為另存姓名記憶）。
- **已做（v3.8.1，使用者 2026-11-25 選「要，改成三選項」）**：主畫面需求表「第8·9節」模式改用與後台相同的三選項（`rosterAttHtml`／`toggleRosterAtt`），舊的 `.mk8`、`toggleSkip8`、`toggleSkip9Day` 已移除。
- **部署踩坑（2026-11-24～25）**：Deploy Pages 從合併 PR #55 那次起連續失敗：上傳成功，但同一個 job 裡的 `deploy-pages` 查不到剛上傳的檔案（`Found 0 artifact(s)`）；重跑同一次執行又變成「找到 2 份」而失敗。PR #57 改成 GitHub 官方範本的 build／deploy 兩個 job 後，部署成功（run 45546581143，正式站 v3.8.0）。日後若再失敗，不要重跑同一次執行，改用手動觸發（workflow_dispatch）開一次新的執行。

### 交接（2026-11-25，給下一個對話）
- **目標**：後台學生名單與第八九節固定資料（DESIGN.md §13）。
- **已完成**：v3.8.0（PR #56）、部署流程修正（PR #57）、v3.8.1（PR #58：需求表三選項、選項固定寬、「部分天數不上9」）都已合併並部署；2026-11-25 已開正式網址確認版號 v3.8.1。設計稿成品頁 5 輪意見都已反映。
- **進行中**：無。
- **已同意**：同一份名單、筆刷保留、單一名單、三種輸入方式、1a、三選項、「只不上第八節」不另設、需求表改三選項、「部分天數」改「部分天數不上9」、PR #56／#57／#58 合併部署。**未同意**：無待決事項。
- **未驗證**：iPad 實機；正式站只確認版號與後台目錄，沒有實際操作名單。
- **路徑**：worktree `seat-helper-wt-89`（本機主目錄 `seat-helper` 停在別人的舊分支 `feat/attendance-marks-ui`，不要動）；設計稿成品頁 https://claude.ai/artifact/GTk2xkEHNjU1wnVXphwzp4 （私人）。

