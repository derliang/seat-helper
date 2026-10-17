# TODO／巡檢記錄

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

## 未實作建議（巡檢時發現，留待日後）

- **PDF 檔案很大**（15 排約 30 MB）：`buildPdfBlob` 把 scale 2 的 PNG 整張塞進去；改用 JPEG（`toDataURL('image/jpeg', 0.92)`）可縮到幾百 KB，但會失去透明與些許銳利度。沿用舊行為，未改。
- `lucide.createIcons()` 每次 `updateUI` 都全頁重掃、`fitSeatNameText` 逐格量 `scrollWidth` 會反覆 reflow：46 人規模感受不到，暫不優化（使用者明令不量測）。
- `cfgCols`／`cfgRows` 同時綁 `oninput` 與 `onchange`，改一次會跑兩次 `initGrid`（各存一次 localStorage）；無害，未改。
- `drawHistory` 無上限：每筆約 2–3 KB，localStorage 5 MB 約可存上千筆，實務上不會碰到。
- `saveData` 沒包 try/catch：localStorage 滿或 Safari 無痕模式會丟例外中斷流程；可加 toast 提示。
- 單一 HTML 已逾 4400 行；若還要加功能，可考慮把 JS 拆出成獨立檔（仍是純靜態，GitHub Pages 無影響）。
