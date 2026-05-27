# 套件版本 API 規格書

適用範圍：`.bob-tools` 左側「套件版本」頁

- Base URL：`http://127.0.0.1:3100`
- Content-Type：`application/json`

---

## 1. 取得套件列表

`GET /api/dependencies`

### Query 參數
- `scope`（可選）：`runtime | dependencies | devDependencies`
- `q`（可選）：關鍵字搜尋（比對套件名稱）

### Response 200
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "name": "ant-design-vue",
        "scope": "dependencies",
        "declaredVersion": "catalog:",
        "installedVersion": "4.2.6",
        "firstSeenAt": "2026-02-18T03:06:43.961Z",
        "lastSeenAt": "2026-02-18T04:09:10.000Z",
        "lastChangedAt": "2026-02-18T03:06:43.961Z",
        "descKey": "dependencyDescriptions.ant-design-vue",
        "descFallback": "Used by this project: ant-design-vue",
        "descMode": "auto",
        "manualDesc": "",
        "noteText": ""
      }
    ],
    "lastScanAt": "2026-02-18T04:09:10.000Z",
    "total": 374
  }
}
```

---

## 2. 立即掃描套件

`POST /api/dependencies/scan`

### Body
```json
{}
```

### Response 200
```json
{
  "success": true,
  "data": {
    "added": 10,
    "updated": 12,
    "unchanged": 352,
    "scanAt": "2026-02-18T04:09:10.000Z",
    "count": 374
  }
}
```

---

## 3. 更新套件解說（自動/手動）

`PUT /api/dependencies/description`

### Body 欄位
- `name`（string，必填）
- `scope`（必填）：`runtime | dependencies | devDependencies`
- `mode`（必填）：`auto | manual`
- `manualDesc`（string）：當 `mode=manual` 時必填且不可空

### 範例：切換手動
```json
{
  "name": "ant-design-vue",
  "scope": "dependencies",
  "mode": "manual",
  "manualDesc": "Ant Design Vue UI 元件庫，用於後台介面元件。"
}
```

### 範例：恢復自動
```json
{
  "name": "ant-design-vue",
  "scope": "dependencies",
  "mode": "auto",
  "manualDesc": ""
}
```

---

## 4. 更新使用筆記

`PUT /api/dependencies/note`

### Body 欄位
- `name`（string，必填）
- `scope`（必填）：`runtime | dependencies | devDependencies`
- `noteText`（string，可空）

### 範例
```json
{
  "name": "ant-design-vue",
  "scope": "dependencies",
  "noteText": "此專案主要使用 Table / Form / Modal 元件。"
}
```

---

## 5. 錯誤回應格式

- 400：參數錯誤
- 404：找不到套件項目
- 500：伺服器錯誤

```json
{
  "success": false,
  "message": "Error message"
}
```

---

## 6. AI 建議呼叫流程

1. `POST /api/dependencies/scan`
2. `GET /api/dependencies?scope=dependencies`
3. 逐筆產生中文套件解說，寫入 `PUT /api/dependencies/description`（`mode=manual`）
4. 補充專案語境筆記，寫入 `PUT /api/dependencies/note`

---

## 7. 欄位語意（給 AI）

- `declaredVersion`：`package.json` 宣告版本（可能為 `catalog:`、`workspace:*`）
- `installedVersion`：實際解析版本（優先 node_modules，pnpm 專案會回填 lock/實際解析值）
- `lastChangedAt`：版本變動時間；若版本未變僅更新 `lastSeenAt`
- `descMode`：`auto` 表示系統規則解說；`manual` 表示使用者手改鎖定
- `noteText`：使用者自由備註，不受 auto/manual 影響
