const fs = require('node:fs');
const path = require('node:path');

const IGNORED_WORKSPACE_DIRS = new Set([
  '.bob-tools',
  '.git',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
]);

class CommandScanService {
  constructor(projectDir, packageManager = 'npm') {
    this.projectDir = projectDir;
    this.packageManager = packageManager;
  }

  classifyScript(scriptName) {
    const key = String(scriptName || '')
      .toLowerCase()
      .trim();
    if (!key) return null;

    // Exact rules first for stable placement.
    const exactRules = {
      bob: { groupId: 'development', categoryId: 'dev-tools' },
      clean: { groupId: 'application', categoryId: 'clean' },
      preinstall: { groupId: 'application', categoryId: 'env-install' },
      postinstall: { groupId: 'application', categoryId: 'env-install' },
      prepare: { groupId: 'application', categoryId: 'env-install' },
      reinstall: { groupId: 'application', categoryId: 'clean' },
      commit: { groupId: 'development', categoryId: 'dev-tools' },
      stub: { groupId: 'development', categoryId: 'dev-tools' },
      kill: { groupId: 'application', categoryId: 'diag' },
      catalog: { groupId: 'application', categoryId: 'diag' },
      'update:deps': { groupId: 'application', categoryId: 'diag' },
      'update-version': { groupId: 'deploy', categoryId: 'release' },
    };
    if (exactRules[key]) return exactRules[key];
    if (key.startsWith('prepare:')) {
      return { groupId: 'application', categoryId: 'env-install' };
    }
    // clean:lock、clean:cache 等子變體歸到清理維護(與 'clean' 同類)
    if (key.startsWith('clean:')) {
      return { groupId: 'application', categoryId: 'clean' };
    }

    // Pattern rules for general scripts.
    if (/(^ci:|:ci:|gate|pipeline|workflow)/.test(key)) {
      return { groupId: 'quality', categoryId: 'check' };
    }
    if (/(docker|compose|k8s|kubectl|helm)/.test(key)) {
      return { groupId: 'deploy', categoryId: 'docker' };
    }
    if (/(obfuscate|minify|uglify|optimi[sz]e)/.test(key)) {
      return { groupId: 'development', categoryId: 'web-build' };
    }
    if (/(version|bump|changelog)/.test(key)) {
      return { groupId: 'deploy', categoryId: 'release' };
    }
    if (/(tauri|electron|wails|desktop)/.test(key)) {
      return { groupId: 'development', categoryId: 'desktop-dev' };
    }
    if (/(test|spec|e2e|coverage|vitest|jest|cypress)/.test(key)) {
      return { groupId: 'quality', categoryId: 'test' };
    }
    if (/(lint|format|typecheck|check|verify)/.test(key)) {
      return { groupId: 'quality', categoryId: 'check' };
    }
    if (/(build|compile|bundle|pack)/.test(key)) {
      return { groupId: 'development', categoryId: 'web-build' };
    }
    if (/(deploy|release|publish)/.test(key)) {
      return { groupId: 'deploy', categoryId: 'release' };
    }
    if (/(dev|start|serve|watch|preview)/.test(key)) {
      return { groupId: 'development', categoryId: 'web-dev' };
    }

    return null;
  }

  explainScript(scriptName) {
    const key = String(scriptName || '')
      .toLowerCase()
      .trim();
    const normalized = this.normalizeScriptKey(scriptName);
    const descKey = normalized ? `commandDescriptions.${normalized}` : 'commandDescriptions.__default';

    const fallbackByExact = {
      bob: `Run ${scriptName} (Start BOB Tools server)`,
      clean: `Run ${scriptName} (Clean cache/build artifacts)`,
      preinstall: `Run ${scriptName} (Pre-install package manager check)`,
      postinstall: `Run ${scriptName} (Post-install initialization)`,
      prepare: `Run ${scriptName} (Prepare runtime or toolchain dependencies)`,
      reinstall: `Run ${scriptName} (Reinstall dependencies after cleanup)`,
      commit: `Run ${scriptName} (Create commit with commit helper)`,
      stub: `Run ${scriptName} (Workspace stub script)`,
      kill: `Run ${scriptName} (Terminate related processes)`,
      'update:deps': `Run ${scriptName} (Update dependency versions)`,
      'update-version': `Run ${scriptName} (Update package/release version)`,
      catalog: `Run ${scriptName} (Update package catalog setup)`,
    };
    if (fallbackByExact[key]) {
      return { descKey, descFallback: fallbackByExact[key] };
    }
    if (key.startsWith('prepare:')) {
      return { descKey, descFallback: `Run ${scriptName} (Prepare runtime or toolchain dependencies)` };
    }
    if (key.startsWith('clean:')) {
      return { descKey, descFallback: `Run ${scriptName} (Clean cache/build artifacts)` };
    }

    if (/(docker|compose|k8s|kubectl|helm)/.test(key)) {
      return { descKey, descFallback: `Run ${scriptName} (Docker/container workflow)` };
    }
    if (/(^ci:|:ci:|gate|pipeline|workflow)/.test(key)) {
      return { descKey, descFallback: `Run ${scriptName} (CI quality gate workflow)` };
    }
    if (/(obfuscate|minify|uglify|optimi[sz]e)/.test(key)) {
      return { descKey, descFallback: `Run ${scriptName} (Build optimization workflow)` };
    }
    if (/(version|bump|changelog)/.test(key)) {
      return { descKey, descFallback: `Run ${scriptName} (Version/release management)` };
    }
    if (/(tauri|electron|wails|desktop)/.test(key)) {
      return { descKey, descFallback: `Run ${scriptName} (Desktop app workflow)` };
    }

    const patternRules = [
      { test: /(test|spec|e2e|coverage|vitest|jest|cypress)/, fallback: `Run ${scriptName} (Execute automated tests)` },
      { test: /(lint|format|typecheck|check|verify)/, fallback: `Run ${scriptName} (Code quality checks)` },
      { test: /(build|compile|bundle|pack)/, fallback: `Run ${scriptName} (Build or package project output)` },
      { test: /(dev|start|serve|watch|preview)/, fallback: `Run ${scriptName} (Start local development flow)` },
      { test: /(deploy|release|publish|docker|k8s|helm)/, fallback: `Run ${scriptName} (Release or deployment pipeline)` },
    ];
    for (const rule of patternRules) {
      if (rule.test.test(key)) {
        return { descKey, descFallback: rule.fallback };
      }
    }

    return { descKey, descFallback: `Run ${scriptName}` };
  }

  normalizeScriptKey(scriptName) {
    return String(scriptName || '')
      .trim()
      .toLowerCase()
      .replaceAll(':', '-');
  }

  normalizeCommandText(commandText) {
    return String(commandText || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  quoteArg(value) {
    const text = String(value || '').trim();
    if (!text) return '""';
    return /\s/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
  }

  normalizeRelPath(targetPath) {
    if (!targetPath) return '.';
    const rel = path.relative(this.projectDir, targetPath);
    if (!rel) return '.';
    return rel.split(path.sep).join('/');
  }

  hasWorkspaceConfig(rootPackageJson) {
    if (fs.existsSync(path.join(this.projectDir, 'pnpm-workspace.yaml'))) {
      return true;
    }

    const workspaces = rootPackageJson?.workspaces;
    if (Array.isArray(workspaces)) return workspaces.length > 0;
    if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages.length > 0;
    return false;
  }

  findWorkspacePackageJsonPaths() {
    const out = [];

    const walk = (dir, depth) => {
      if (depth > 5) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      const hasPackageJson = entries.some((entry) => entry.isFile() && entry.name === 'package.json');
      if (hasPackageJson) {
        const packageJsonPath = path.join(dir, 'package.json');
        if (packageJsonPath !== path.join(this.projectDir, 'package.json')) {
          out.push(packageJsonPath);
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (IGNORED_WORKSPACE_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      }
    };

    walk(this.projectDir, 0);
    return out;
  }

  toScriptIdentity(scriptName, options = {}) {
    const safeName = String(scriptName || '').trim();
    if (!safeName) return '';

    const { isRoot, packageDir, packageName } = options;
    if (isRoot) return safeName;

    const packageToken = String(packageName || '').trim() || this.normalizeRelPath(packageDir);
    return `${packageToken}:${safeName}`;
  }

  buildScriptItems({ scriptsObj, sourceFile, packageDir, packageName, isRoot }) {
    const items = [];

    for (const scriptName of Object.keys(scriptsObj || {})) {
      const safeScriptName = String(scriptName || '').trim();
      if (!safeScriptName) continue;

      const runCmd = this.toRunCommand(safeScriptName, { isRoot, packageDir, packageName });
      const explain = this.explainScript(safeScriptName);

      items.push({
        ...this.classifyScript(safeScriptName),
        ...explain,
        name: this.toScriptIdentity(safeScriptName, { isRoot, packageDir, packageName }),
        scriptName: safeScriptName,
        packageName: String(packageName || '').trim() || null,
        packageDir: this.normalizeRelPath(packageDir),
        sourceFile,
        cmd: String(scriptsObj[safeScriptName]),
        runCmd,
      });
    }

    return items;
  }

  scanRootPackageScripts() {
    const packagePath = path.join(this.projectDir, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`package.json not found at project root: ${packagePath}`);
    }

    const raw = fs.readFileSync(packagePath, 'utf8');
    const json = JSON.parse(raw);
    const rootScriptsObj = json?.scripts || {};
    const scripts = this.buildScriptItems({
      scriptsObj: rootScriptsObj,
      sourceFile: packagePath,
      packageDir: this.projectDir,
      packageName: json?.name || null,
      isRoot: true,
    });
    const rootProxyTargets = new Set(
      scripts
        .map((item) => this.normalizeCommandText(item?.cmd))
        .filter(Boolean)
    );

    if (this.hasWorkspaceConfig(json)) {
      for (const childPackagePath of this.findWorkspacePackageJsonPaths()) {
        try {
          const childRaw = fs.readFileSync(childPackagePath, 'utf8');
          const childJson = JSON.parse(childRaw);
          const childScriptsObj = childJson?.scripts || {};
          if (!Object.keys(childScriptsObj).length) continue;

          const childItems = this.buildScriptItems({
            scriptsObj: childScriptsObj,
            sourceFile: childPackagePath,
            packageDir: path.dirname(childPackagePath),
            packageName: childJson?.name || null,
            isRoot: false,
          });
          const uniqueChildItems = childItems.filter((item) => {
            const normalizedRun = this.normalizeCommandText(item?.runCmd);
            return !normalizedRun || !rootProxyTargets.has(normalizedRun);
          });
          scripts.push(...uniqueChildItems);
        } catch {
          // Ignore invalid workspace package.json entries.
        }
      }
    }

    return {
      sourceFile: packagePath,
      scripts,
    };
  }

  setPackageManager(packageManager) {
    if (packageManager) this.packageManager = packageManager;
  }

  toRunCommand(scriptName, options = {}) {
    const safeName = String(scriptName || '').trim();
    if (!safeName) return '';

    const pm = String(this.packageManager || 'npm').trim() || 'npm';
    const isRoot = Boolean(options.isRoot);
    const packageName = String(options.packageName || '').trim();
    const packageDir = this.normalizeRelPath(options.packageDir || this.projectDir);

    if (isRoot) {
      return `${pm} run ${safeName}`;
    }

    if (pm === 'pnpm') {
      if (packageName) return `pnpm --filter ${this.quoteArg(packageName)} run ${safeName}`;
      return `pnpm -C ${this.quoteArg(packageDir)} run ${safeName}`;
    }

    if (pm === 'yarn') {
      if (packageName) return `yarn workspace ${this.quoteArg(packageName)} run ${safeName}`;
      return `yarn --cwd ${this.quoteArg(packageDir)} run ${safeName}`;
    }

    // npm fallback
    return `npm --prefix ${this.quoteArg(packageDir)} run ${safeName}`;
  }
}

module.exports = { CommandScanService };
