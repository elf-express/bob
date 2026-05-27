# 亂碼處理 Skill（BOB Tools）

## 目的
建立一套可重複執行的流程，避免 `.bob-tools` 在語系批次更新時出現 `U+FFFD`（replacement char）、`????`、連續 `?` 等汙染。

## 今日問題成因（Root Cause）
1. Shell 編碼不一致：PowerShell 非 UTF-8 狀態下，中文字串透過 heredoc 傳給 `node` 會先被轉成 `?`。
2. 歷史資料已污染：語系檔原本已有 `U+FFFD` / `????`，批次處理時容易擴散。
3. 在錯誤編碼環境做大量寫入：邏輯正確仍會把錯字持久化到 JSON。

## 症狀
- UI 出現 `????`、`U+FFFD`、或中英文混亂。
- `zh-TW/common.json`、`zh-CN/common.json` 某些 key 被 `?` 取代。
- 看似「修復成功」後，下一輪又復發。

## 修復流程（SOP）
1. 先鎖 UTF-8 再執行任何批次腳本。
2. 先做污染清洗：
   - 命中 `U+FFFD` / `????` / 連續 `?` 的值，先回退到 `en-US` 同 key。
3. 再回填翻譯：
   - 用 key-based 字典寫入 zh-TW/zh-CN。
   - 保留變數占位符（例如 `{name}`、`{count}`）。
4. 最後三項驗證：
   - JSON parse 必須成功。
   - `rg "\\uFFFD|\\?\\?\\?\\?"` 無命中。
   - 英文 fallback 統計降到可接受（只留專有名詞/範例值）。

## 實作守則
1. 所有批次改語系的指令前，先設定：
   - `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`
   - `[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)`
   - `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)`
2. 不要在未設 UTF-8 的 shell 直接貼大段中文腳本。
3. 批次修復採「先回退英文，再翻譯」兩階段，避免把壞資料二次擴散。
4. 翻譯時以 key 為主，不用值比對推測語意。

## 驗收清單
1. `zh-TW` / `zh-CN` JSON 可 parse。
2. 無 `U+FFFD`、`????`。
3. UI 主頁（設定、命令、備份、配置編輯器）無亂碼。
4. `commandDescriptions.*` 不再大量英文 fallback（除非刻意保留）。

## 建議長期改善
1. 新增 CI 檢查：阻擋 `U+FFFD`、`????`、可疑連續 `?` 進版控。
2. 將語系批次更新腳本固定化（單一入口），不要臨時拼接命令。
3. 將專有名詞白名單化（如 `Docker`、`setup`、`pnpm install`），避免誤判。
