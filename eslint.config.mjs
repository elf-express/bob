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
  {
    files: ['*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  // 前端：瀏覽器一般 script
  {
    files: ['public/js/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: { 'no-unused-vars': ['error', { vars: 'local' }] },
  },
  eslintConfigPrettier,
]
