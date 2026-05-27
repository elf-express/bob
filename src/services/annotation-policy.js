const path = require('node:path');

const AI_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
  '.cs', '.csproj', '.sln',
  '.dart',
  '.py', '.go', '.rs', '.java', '.kt',
  '.rb', '.php',
]);

const MANUAL_EXTENSIONS = new Set([
  '.json', '.yml', '.yaml', '.toml', '.ini',
  '.env', '.properties', '.conf',
]);

const MANUAL_FILENAMES = new Set([
  '.dockerignore', '.gitignore', '.gitattributes',
  '.editorconfig', '.npmrc', '.prettierrc',
  'LICENSE', 'CODEOWNERS',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.webm', '.mov', '.mp3', '.wav',
  '.pdf', '.zip', '.tar', '.gz', '.7z',
  '.log', '.lock',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
]);

const OPTIONAL_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

/**
 * Determines annotation mode for a given file path
 * @param {string} filePath - File path (absolute or relative, only basename and ext matter)
 * @returns {'ai'|'manual'|'skip'|'optional'} Annotation mode
 */
function getAnnotationMode(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const name = path.basename(String(filePath || ''));

  if (SKIP_EXTENSIONS.has(ext)) return 'skip';
  if (MANUAL_FILENAMES.has(name)) return 'manual';
  // .env 及其變體(.env.production / .env.local 等):path.extname('.env') = '' 抓不到,必須用 basename startsWith
  if (name === '.env' || name.startsWith('.env.')) return 'manual';
  if (AI_EXTENSIONS.has(ext)) return 'ai';
  if (MANUAL_EXTENSIONS.has(ext)) return 'manual';
  if (OPTIONAL_EXTENSIONS.has(ext)) return 'optional';
  return 'skip';
}

module.exports = {
  getAnnotationMode,
  AI_EXTENSIONS,
  MANUAL_EXTENSIONS,
  MANUAL_FILENAMES,
  SKIP_EXTENSIONS,
  OPTIONAL_EXTENSIONS,
};
