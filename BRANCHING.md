# 分支規範：本 repo 為【第 3 種：自有專案】

> 完整規範：[分支規範：三種 repo 類型](https://linear.app/elf-express/document/分支規範三種-repo-類型貢獻型-fork私有-fork自有專案-128bf6e5e1f9)（Linear）
> 本檔只記錄這個 repo 的設定。人與 AI 動手前請先讀完本檔。

## 本 repo 資訊

| 項目                  | 值                                     |
| --------------------- | -------------------------------------- |
| 類型                  | 第 3 種：自有專案（沒有上游）          |
| 本 repo（`origin`） | `elf-express/bob`          |
| 部署位置              | 無伺服器部署；本機 host tool，以 `@elf-express/bob` npm 套件發佈（來源 `release`） |

行尾：LF，由 `.gitattributes` 規定（範本：elf-team-rule `assets/gitattributes`）

## 分支用途

| 分支                      | 用途                 | 可否提交                 | 從哪裡更新      |
| ------------------------- | -------------------- | ------------------------ | --------------- |
| `main`                  | 主庫，只用來同步     | **不提交，只快轉** | `release`     |
| `dev`                   | 整合測試             | 只能經由開發分支合併     | —              |
| `feat/`、`fix/`、`docs/`、`chore/`、`test/` | 開發                 | 可以                     | 從 `dev` 開出 |
| `release`               | 唯一的穩定版，部署用 | **不提交，只快轉** | 測過的 `dev`（緊急修正時 `hotfix/`） |
| `hotfix/`               | 緊急修正正式版       | 可以                     | 從 `origin/release` 開出 |

開發分支命名 `<類型>/e-<編號>-<英文短名>`（類型：`feat`、`fix`、`docs`、`chore`、`test`、`hotfix`；有 Spec／Plan 用 Plan 編號，單一工作單用該單編號）。

## 常用指令

開發：

```
git fetch origin
git switch -c feat/e-<編號>-<短名> origin/dev
```

發佈（`dev` 測試通過後）：

```
git fetch origin
git log --oneline origin/release..origin/dev   # 先列出會帶進去的提交，給使用者確認
git switch release
git merge --ff-only origin/release   # 先把本機 release 更新到最新
git merge --ff-only origin/dev
git push origin release
```

更新主庫：

```
git fetch origin
git log --oneline origin/main..origin/release   # 先列出會帶進去的提交
git switch main
git merge --ff-only origin/release
git push origin main
```

緊急修正（hotfix，`dev` 有未測完的內容時；完整步驟見 elf-team-rule `references/03-own-project.md`）：

```
git fetch origin
git switch -c hotfix/e-<編號>-<短名> origin/release
# 修改、測試、提交後 git push -u origin hotfix/e-<編號>-<短名>
gh pr create --repo elf-express/bob --draft --base release --head hotfix/e-<編號>-<短名> --title "hotfix(E-<編號>): <說明>（僅觸發 CI，不要合併）" --body "E-<編號>"   # CI 沒有 hotfix/** 推送觸發時才需要；repo 沒有任何 workflow 時省略
git log --oneline origin/release..origin/hotfix/e-<編號>-<短名>   # 先列出會帶進去的提交，給使用者確認
gh api "repos/elf-express/bob/commits/$(git rev-parse origin/hotfix/e-<編號>-<短名>)/check-runs?filter=latest&per_page=100" --jq '.check_runs[]|"\(.status) \(.conclusion) \(.name)"'   # 全部通過才發佈（判斷方式見 elf-team-rule references/04 第 0 節）
git fetch origin && git switch release && git merge --ff-only origin/release && git merge --ff-only origin/hotfix/e-<編號>-<短名> && git push origin release   # 任何一步失敗 → 停下來回報
git fetch origin && git switch dev && git merge --ff-only origin/dev   # 立刻合回 dev；失敗 → 停下來回報
git log --oneline origin/dev..dev   # 必須是空的；有輸出 → 本機 dev 有沒推的提交，停下來回報
git merge --no-edit origin/release   # 有衝突 → git merge --abort，停下來回報
git push origin dev
git switch main && git merge --ff-only origin/main && git merge --ff-only origin/release && git push origin main
```

## 分支保護設定建議

建議在 GitHub 設定分支保護規則（Branch Protection Rules 或 Ruleset）：

* **`main` 與 `release`**：禁止 force push、禁止刪除、只允許維護者 push。**不要**設「必須經過 Pull Request」：這兩條分支是在本機 `merge --ff-only` 後直接 push 的，GitHub 的 PR 合併會產生新提交或新 SHA，無法快轉。
* **`dev`**：禁止 force push、禁止刪除；開發分支（`feat/*`、`fix/*`、`docs/*`、`chore/*`、`test/*`、`merge/*`）一律經 PR 合併，用 merge commit（elf-team-rule 規則 37），維護者保留直接 push 權限，給 hotfix 發佈後的 `release` → `dev` 合回使用。

## 禁止事項

* 不在 `main`、`release` 上提交，也不 force push。緊急修正一律走 hotfix，不直接改 `release`／`main`。
* 不在 check runs 未全部通過、或沒有 CI 且使用者未明確同意例外時快轉 `release`。
* 不把 `main` 當穩定版或部署來源；部署一律用 `release`。
* 不直接在 `dev` 上開發。
* `--ff-only` 失敗或合併有衝突時，停下來回報，不要自行處理。
