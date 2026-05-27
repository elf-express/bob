function buildDefaultConfig(projectName = 'BOB-Tools') {
  return {
    projectName,
    groups: [
      {
        id: 'uncategorized',
        name: '未分類',
        description: '尚未分類命令',
        icon: 'inbox',
        collapsed: false,
        categories: [
          {
            id: 'uncategorized',
            name: '未分類',
            description: '尚未分類命令',
            collapsed: false,
            commands: [],
          },
        ],
      },
      {
        id: 'application',
        name: '應用',
        description: '專案與環境相關命令',
        icon: 'app-window',
        collapsed: false,
        categories: [
          {
            id: 'env-install',
            name: '環境安裝',
            description: '初始化與依賴安裝',
            collapsed: false,
            commands: [],
          },
          {
            id: 'clean',
            name: '清理維護',
            description: '清理快取與建置產物',
            collapsed: true,
            commands: [],
          },
          {
            id: 'diag',
            name: '診斷',
            description: '環境與相依診斷',
            collapsed: true,
            commands: [],
          },
        ],
      },
      {
        id: 'development',
        name: '開發',
        description: '本機開發流程',
        icon: 'code-2',
        collapsed: false,
        categories: [
          {
            id: 'web-dev',
            name: 'Web 開發',
            description: '前端或服務開發命令',
            collapsed: false,
            commands: [],
          },
          {
            id: 'web-build',
            name: 'Web 建置',
            description: 'Web 建置與打包命令',
            collapsed: true,
            commands: [],
          },
          {
            id: 'desktop-dev',
            name: '桌面開發',
            description: '桌面應用開發命令',
            collapsed: true,
            commands: [],
          },
          {
            id: 'dev-tools',
            name: '開發工具',
            description: '開發輔助命令',
            collapsed: true,
            commands: [],
          },
        ],
      },
      {
        id: 'quality',
        name: '品質',
        description: '檢查與測試',
        icon: 'shield-check',
        collapsed: false,
        categories: [
          {
            id: 'check',
            name: '程式碼檢查',
            description: 'lint/typecheck/check',
            collapsed: false,
            commands: [],
          },
          {
            id: 'lint-fix',
            name: '自動修復',
            description: 'eslint/prettier 自動修復',
            collapsed: true,
            commands: [],
          },
          {
            id: 'test',
            name: '測試',
            description: 'unit/e2e/coverage 測試',
            collapsed: true,
            commands: [],
          },
        ],
      },
      {
        id: 'deploy',
        name: '部署',
        description: '建置與發佈',
        icon: 'rocket',
        collapsed: false,
        categories: [
          {
            id: 'release',
            name: '發佈',
            description: 'release/publish/deploy',
            collapsed: false,
            commands: [],
          },
          {
            id: 'docker',
            name: 'Docker',
            description: 'Docker 相關命令',
            collapsed: true,
            commands: [],
          },
        ],
      },
    ],
  };
}

module.exports = { buildDefaultConfig };
