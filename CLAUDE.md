# 座位小幫手（seat-helper）專案規則

- 單檔靜態網頁：`index.html` 與 `seat_helper.html`（離線交付檔）內容必須完全相同，改一份就要同步另一份。
- 版號唯一來源是 `APP_VERSION`，發版規則見 README「版號規則」。
- 版權標示與 `LICENSE.md` 不得移除或改寫，詳見 `TODO.md` 版權維護規範。

## 設計規範（改頁面前必讀）

- 本專案的設計規範在 [docs/design/DESIGN.md](docs/design/DESIGN.md)，定案的模擬頁在 `docs/design/mockups/`。一切頁面、版面、元件、樣式的工作以它為準。
- 新增、改版、調整任何頁面前，先讀它。沿用其中的 tokens 與元件規則，不寫死色碼與間距。
- 新頁面或大改版使用 `設計` 技能（輸入 `/設計`）：先在對話中出設計稿給使用者確認，定案後把規範與模擬頁更新回 `docs/design/`，和程式放在同一個 PR。
- 要偏離規範，先更新 DESIGN.md 並取得使用者確認，不要只改程式。
