const path = require('node:path');

const PATH_PATTERNS = [
  { match: '/api/', purpose: 'API client / data fetching', tag: 'api' },
  { match: '/composables/', purpose: 'Vue Composition API hook', tag: 'composable' },
  { match: '/views/', purpose: 'Page-level Vue component', tag: 'view' },
  { match: '/components/', purpose: 'Shared UI component', tag: 'component' },
  { match: '/stores/', purpose: 'Pinia store', tag: 'store' },
  { match: '/utils/', purpose: 'Pure utility function', tag: 'utility' },
  { match: '/types/', purpose: 'TypeScript type definition', tag: 'types' },
  { match: '/routes/', purpose: 'Express route handler', tag: 'route' },
  { match: '/services/', purpose: 'Service / business logic module', tag: 'service' },
  { match: '/repositories/', purpose: 'Data repository (DB access)', tag: 'repository' },
  { match: '/db/migrations/', purpose: 'SQLite schema migration', tag: 'migration' },
];

/**
 * Generate annotation for a single file using rule-based engine
 * @param {string} filePath - Relative file path (used for path pattern inference)
 * @param {string} fileContent - File content (used for imports + export name parsing)
 * @returns {{ purpose: string, relations: string, tags: string[], engine: string, confidence: 'low'|'medium' }}
 */
function generateAnnotation(filePath, fileContent) {
  const safePath = String(filePath || '');
  const safeContent = String(fileContent || '');
  const normalizedPath = safePath.split('\\').join('/');

  // 1) Infer purpose + tag from path pattern
  let purpose = '';
  const tags = [];
  for (const { match, purpose: p, tag } of PATH_PATTERNS) {
    if (normalizedPath.includes(match)) {
      purpose = p;
      tags.push(tag);
      break;
    }
  }
  if (/\.test\.[a-z]+$/i.test(normalizedPath)) {
    purpose = purpose || 'Unit test';
    if (!tags.includes('test')) tags.push('test');
  }

  // 2) Extract export name to append to purpose
  //    matches: export default class X / export function X / export const X / export default function X / class X
  const exportMatch = safeContent.match(
    /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/
  );
  const className = !exportMatch && safeContent.match(/(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)/);
  const name = exportMatch ? exportMatch[1] : (className ? className[1] : '');
  if (purpose && name) {
    purpose = `${purpose}: ${name}`;
  } else if (!purpose && name) {
    purpose = name;
  }

  // 3) Extract imports to infer relations (keep only project-internal paths starting with . / @/ / @sa/)
  // 用 \b word boundary 而非 (?:^|\n)\s*,讓單行多 import(`; import ...`)也能抓到
  const importPattern = /\bimport\s+[^'"]*?from\s+['"]((?:[^'"\\]|\\.)*?)['"]/g;
  const requirePattern = /\brequire\(\s*['"]((?:[^'"\\]|\\.)*?)['"]\s*\)/g;
  const rels = new Set();
  let match;

  while ((match = importPattern.exec(safeContent))) {
    const target = match[1] || '';
    if (target.startsWith('.') || target.startsWith('@/') || target.startsWith('@sa/')) {
      rels.add(target);
    }
  }

  while ((match = requirePattern.exec(safeContent))) {
    const target = match[1] || '';
    if (target.startsWith('.') || target.startsWith('@/') || target.startsWith('@sa/')) {
      rels.add(target);
    }
  }

  const relations = Array.from(rels).join(',');

  return {
    purpose,
    relations,
    tags,
    engine: 'rule-based',
    confidence: purpose ? 'medium' : 'low',
  };
}

module.exports = { generateAnnotation, PATH_PATTERNS };
