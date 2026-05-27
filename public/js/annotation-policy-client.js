// Frontend mirror of backend services/annotation-policy.js
// When modifying extension sets, update both files in sync.

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

function getAnnotationModeClient(filePath) {
  const p = String(filePath || '');
  // Extract basename and extension without node:path (browser-compatible)
  const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const name = lastSlash >= 0 ? p.slice(lastSlash + 1) : p;
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot > 0 ? name.slice(lastDot).toLowerCase() : '';

  if (SKIP_EXTENSIONS.has(ext)) return 'skip';
  if (MANUAL_FILENAMES.has(name)) return 'manual';
  if (name === '.env' || name.startsWith('.env.')) return 'manual';
  if (AI_EXTENSIONS.has(ext)) return 'ai';
  if (MANUAL_EXTENSIONS.has(ext)) return 'manual';
  if (OPTIONAL_EXTENSIONS.has(ext)) return 'optional';
  return 'skip';
}

// Expose to window scope — BOB UI loads scripts via <script src="...">, not ES modules.
window.getAnnotationModeClient = getAnnotationModeClient;
