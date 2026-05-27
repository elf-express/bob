// ===== 專案架構瀏覽器 — 圖示映射 =====
// 根據檔名 / 副檔名 / 目錄狀態 回傳對應的圖示配置
// 優先順序：Material Icon Theme > Emoji > Lucide fallback

/**
 * 取得檔案圖示設定
 * @param {Object} item - 檔案項目 { name, isDirectory, isRoot }
 * @param {boolean} isExpanded - 是否展開（目錄用）
 * @returns {Object} { type: 'lucide'|'devicon'|'image'|'emoji', value: string, color?: string }
 */
function getFileIconConfig(item, isExpanded) {
    const materialBaseUrl = 'https://raw.githubusercontent.com/PKief/vscode-material-icon-theme/main/icons';
    
    if (item.isDirectory) {
        // 使用 Emoji 作為資料夾圖示，以獲得 3D 立體效果
        return { 
            type: 'emoji', 
            value: isExpanded ? '📂' : '📁' 
        };
    }
    
    // Root handling
    if (item.isRoot) {
        return { type: 'emoji', value: '📦' };
    }
    
    const name = item.name.toLowerCase();
    const ext = name.split('.').pop();
    
    // Material Theme 檔案映射
    const fileMapping = {
        'browserslistrc': 'browserslist',
        '.browserslistrc': 'browserslist',
        'package.json': 'nodejs',
        'package-lock.json': 'nodejs',
        'yarn.lock': 'yarn',
        'pnpm-lock.yaml': 'pnpm',
        'tsconfig.json': 'tsconfig',
        'jsconfig.json': 'jsconfig',
        '.gitignore': 'git',
        '.gitattributes': 'git',
        '.env': 'tune',
        '.env.local': 'tune',
        '.env.development': 'tune',
        '.env.production': 'tune',
        'readme.md': 'readme',
        'dockerfile': 'docker',
        'docker-compose.yml': 'docker',
        'docker-compose.yaml': 'docker',
        'license': 'license',
        'license.md': 'license',
        'changelog.md': 'changelog',
        'makefile': 'makefile',
        'robots.txt': 'robots',
        'favicon.ico': 'favicon',
        // Extensions
        'js': 'javascript',
        'cjs': 'javascript',
        'mjs': 'javascript',
        'jsx': 'react',
        'ts': 'typescript',
        'tsx': 'react_ts',
        'vue': 'vue',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'sass',
        'sass': 'sass',
        'less': 'less',
        'styl': 'stylus',
        'json': 'json',
        'json5': 'json',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'toml': 'yaml',
        'ini': 'settings',
        'md': 'markdown',
        'mdx': 'markdown',
        'py': 'python',
        'go': 'go',
        'java': 'java',
        'jar': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'rs': 'rust',
        'sh': 'console',
        'bash': 'console',
        'zsh': 'console',
        'bat': 'console',
        'cmd': 'console',
        'ps1': 'console',
        'sql': 'database',
        'sqlite': 'database',
        'db': 'database',
        'png': 'image',
        'jpg': 'image',
        'jpeg': 'image',
        'gif': 'image',
        'svg': 'svg',
        'ico': 'image',
        'webp': 'image',
        'bmp': 'image',
        'tiff': 'image',
        'mp4': 'video',
        'mov': 'video',
        'avi': 'video',
        'mp3': 'audio',
        'wav': 'audio',
        'zip': 'zip',
        'tar': 'zip',
        'gz': 'zip',
        '7z': 'zip',
        'rar': 'zip',
        'pdf': 'pdf',
        'doc': 'word',
        'docx': 'word',
        'xls': 'excel',
        'xlsx': 'excel',
        'ppt': 'powerpoint',
        'pptx': 'powerpoint',
        'txt': 'document',
        'log': 'log',
        'npmrc': 'npm',
        'eslintrc': 'eslint',
        'eslintignore': 'eslint',
        'prettierrc': 'prettier',
        'prettierignore': 'prettier',
        'babelrc': 'babel',
        'config.js': 'settings',
        'config.ts': 'settings',
        'config.json': 'settings',
        'lock': 'lock',
    };

    // 優先檢查全名
    if (fileMapping[name]) {
        return { type: 'image', value: `${materialBaseUrl}/${fileMapping[name]}.svg` };
    }
    
    // 檢查一些特定後綴的設定檔
    if (name.includes('jest.config')) return { type: 'image', value: `${materialBaseUrl}/jest.svg` };
    if (name.includes('vite.config')) return { type: 'image', value: `${materialBaseUrl}/vite.svg` };
    if (name.includes('webpack.config')) return { type: 'image', value: `${materialBaseUrl}/webpack.svg` };
    if (name.includes('rollup.config')) return { type: 'image', value: `${materialBaseUrl}/rollup.svg` };
    if (name.includes('tailwind.config')) return { type: 'image', value: `${materialBaseUrl}/tailwindcss.svg` };
    if (name.endsWith('.config.js') || name.endsWith('.config.ts')) {
         // 簡單處理，如果沒匹配到上面的全名，就用 settings
         return { type: 'image', value: `${materialBaseUrl}/settings.svg` };
    }
    
    // 檢查副檔名
    if (fileMapping[ext]) {
        return { type: 'image', value: `${materialBaseUrl}/${fileMapping[ext]}.svg` };
    }

    // 預設
    return { type: 'image', value: `${materialBaseUrl}/file.svg` };
}
