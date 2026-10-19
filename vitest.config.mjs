import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // 測試檔與被測檔同資料夾：foo.js -> foo.test.js
    include: ['src/**/*.test.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // server.js 是 CLI 入口，載入即開始監聽
      exclude: ['src/**/*.test.js', 'src/server.js'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: { lines: 55 },
    },
  },
})
