import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  // 與 .prettierignore 相同
  { ignores: ['node_modules/', 'coverage/', 'pnpm-lock.yaml', 'data/', 'log/', '.ocrca/'] },
  js.configs.recommended,
  // 伺服器端：src/** 與根目錄設定檔
  {
    files: ['src/**/*.js', '*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  // 單元測試：ESM import 寫法，由 Vitest 轉譯
  {
    files: ['src/**/*.test.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    files: ['*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  // 前端：瀏覽器一般 script
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        renderReferences: 'readonly', // public/js/references.js:12（window 屬性）
        lucide: 'readonly', // public/index.html:10（CDN）
      },
    },
    rules: { 'no-unused-vars': ['error', { vars: 'local' }] },
  },
  // 前端跨檔全域變數：依定義檔分組，ignores 排除定義檔本身（避免 no-redeclare 判定與內建全域重複）
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/i18n.js'],
    languageOptions: {
      globals: {
        i18n: 'readonly', // public/js/i18n.js:272
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/file-tree-api.js'],
    languageOptions: {
      globals: {
        fetchFiles: 'readonly', // public/js/file-tree-api.js:10
        searchFilesApi: 'readonly', // public/js/file-tree-api.js:29
        fetchProjectStats: 'readonly', // public/js/file-tree-api.js:49
        saveAnnotationApi: 'readonly', // public/js/file-tree-api.js:72
        scanCommandsApi: 'readonly', // public/js/file-tree-api.js:173
        scanTreeApi: 'readonly', // public/js/file-tree-api.js:183
        fetchLatestScanSummary: 'readonly', // public/js/file-tree-api.js:193
        fetchFileMetadataApi: 'readonly', // public/js/file-tree-api.js:205
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/file-tree-icons.js'],
    languageOptions: {
      globals: {
        getFileIconConfig: 'readonly', // public/js/file-tree-icons.js:11
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/file-tree-tags.js'],
    languageOptions: {
      globals: {
        renderTagBadges: 'readonly', // public/js/file-tree-tags.js:58
        renderTagSelector: 'readonly', // public/js/file-tree-tags.js:83
        fetchFileTags: 'readonly', // public/js/file-tree-tags.js:107
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/file-tree-annotation.js'],
    languageOptions: {
      globals: {
        annT: 'readonly', // public/js/file-tree-annotation.js:1
        showFileDetails: 'readonly', // public/js/file-tree-annotation.js:197
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/file-tree.js'],
    languageOptions: {
      globals: {
        projectExplorerState: 'readonly', // public/js/file-tree.js:2
        initProjectExplorer: 'readonly', // public/js/file-tree.js:300
      },
    },
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/modern-app.js'],
    languageOptions: {
      globals: {
        refreshIcons: 'readonly', // public/js/modern-app.js:127
        mergeScannedScriptsIntoConfig: 'readonly', // public/js/modern-app.js:1905
        autoSaveConfig: 'readonly', // public/js/modern-app.js:2838
      },
    },
  },
  {
    files: ['public/js/i18n.js'],
    languageOptions: {
      globals: {
        module: 'readonly', // public/js/i18n.js:278 的 CommonJS 匯出防護
      },
    },
  },
  // 正則刻意比對控制字元：modern-app.js:12 以 \x00-\x7F 偵測非 ASCII 字元，modern-app.js:553 比對 ANSI 跳脫序列 \x1b
  {
    files: ['public/js/modern-app.js'],
    rules: { 'no-control-regex': 'off' },
  },
  // 正則刻意比對控制字元：format.js:7 移除 ANSI 跳脫序列 \u001B，format.js:58 移除檔名中的 \x00-\x1F 控制字元
  {
    files: ['src/utils/format.js'],
    rules: { 'no-control-regex': 'off' },
  },
  eslintConfigPrettier,
]
