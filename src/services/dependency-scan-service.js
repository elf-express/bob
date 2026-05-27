const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

class DependencyScanService {
  constructor(projectDir, packageManagerProvider) {
    this.projectDir = projectDir;
    this.packageManagerProvider = packageManagerProvider;
    this.pnpmDirectVersionIndex = null;
  }

  normalizeName(name) {
    return String(name || '').trim().toLowerCase().replaceAll('/', '-').replaceAll(':', '-');
  }

  explain(name) {
    const keyName = this.normalizeName(name);
    const descKey = `dependencyDescriptions.${keyName}`;
    const exact = {
      node: 'Node.js runtime version used by this project.',
      'package-manager': 'Package manager selected for install and run scripts.',
      typescript: 'TypeScript compiler and type-checking tooling.',
      vite: 'Frontend dev server and build tool.',
      eslint: 'Code linting and static analysis.',
      vitest: 'Unit test runner.',
      express: 'HTTP server framework.',
      sqlite3: 'SQLite database driver.',
      npm: 'Node package manager.',
      pnpm: 'Fast and disk-efficient package manager.',
      yarn: 'Node package manager.',
    };
    if (exact[keyName]) return { descKey, descFallback: exact[keyName] };

    if (keyName.startsWith('@types-')) {
      return { descKey, descFallback: `Type definitions package: ${name}.` };
    }
    if (keyName.startsWith('eslint-')) {
      return { descKey, descFallback: `ESLint plugin/config package: ${name}.` };
    }
    if (keyName.startsWith('vitest-')) {
      return { descKey, descFallback: `Vitest related package: ${name}.` };
    }
    if (keyName.startsWith('@vitejs-')) {
      return { descKey, descFallback: `Vite ecosystem package: ${name}.` };
    }
    return { descKey, descFallback: `Used by this project: ${name}` };
  }

  buildPnpmDirectVersionIndex() {
    if (this.pnpmDirectVersionIndex) return this.pnpmDirectVersionIndex;

    const index = {
      byManifest: new Map(),
      byScope: new Map(),
      byName: new Map(),
    };

    try {
      const raw = execSync('pnpm -r list --depth 0 --json', {
        cwd: this.projectDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const rows = JSON.parse(String(raw || '[]'));
      if (!Array.isArray(rows)) {
        this.pnpmDirectVersionIndex = index;
        return index;
      }

      for (const row of rows) {
        const manifestPath = path.resolve(String(row?.path || ''));
        if (!manifestPath) continue;
        const manifestMap = {
          dependencies: new Map(),
          devDependencies: new Map(),
        };

        for (const scope of ['dependencies', 'devDependencies']) {
          const deps = row?.[scope] || {};
          for (const [name, info] of Object.entries(deps)) {
            const version = String(info?.version || '');
            if (!version) continue;
            manifestMap[scope].set(name, version);

            const scopeKey = `${scope}:${name}`;
            if (!index.byScope.has(scopeKey)) {
              index.byScope.set(scopeKey, version);
            }
            if (!index.byName.has(name)) {
              index.byName.set(name, version);
            }
          }
        }
        index.byManifest.set(manifestPath, manifestMap);
      }
    } catch {
      // Ignore and fallback to filesystem probing.
    }

    this.pnpmDirectVersionIndex = index;
    return index;
  }

  readInstalledVersion(name, manifestDir = this.projectDir, scope = 'dependencies') {
    const candidates = [
      path.join(manifestDir, 'node_modules', ...name.split('/'), 'package.json'),
      path.join(this.projectDir, 'node_modules', ...name.split('/'), 'package.json'),
    ];
    for (const packageJsonPath of candidates) {
      try {
        if (!fs.existsSync(packageJsonPath)) continue;
        const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return String(json?.version || 'unknown');
      } catch {
        return 'unknown';
      }
    }

    const index = this.pnpmDirectVersionIndex;
    if (index) {
      const manifestKey = path.resolve(manifestDir);
      const manifestEntry = index.byManifest.get(manifestKey);
      const scopedVersion = manifestEntry?.[scope]?.get(name);
      if (scopedVersion) return scopedVersion;

      const fallbackScopedVersion = index.byScope.get(`${scope}:${name}`);
      if (fallbackScopedVersion) return fallbackScopedVersion;

      const fallbackNameVersion = index.byName.get(name);
      if (fallbackNameVersion) return fallbackNameVersion;
    }

    return 'not-installed';
  }

  resolvePackageManagerVersion(packageManager) {
    if (!packageManager) return 'unknown';
    try {
      const output = execSync(`${packageManager} --version`, {
        cwd: this.projectDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return String(output || '').trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  readRootPackageJson() {
    const packagePath = path.join(this.projectDir, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`package.json not found at project root: ${packagePath}`);
    }
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  }

  findWorkspacePackageJsonPaths() {
    const out = [];
    const ignoredDirs = new Set(['.bob-tools', '.git', '.idea', '.vscode', 'coverage', 'dist', 'node_modules']);

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
        if (ignoredDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      }
    };

    walk(this.projectDir, 0);
    return out;
  }

  async scan() {
    const pkg = this.readRootPackageJson();
    const effectivePm = this.packageManagerProvider ? await this.packageManagerProvider() : 'npm';
    this.pnpmDirectVersionIndex = effectivePm === 'pnpm' ? this.buildPnpmDirectVersionIndex() : null;
    const list = [];
    const exists = new Set();
    const pushUnique = (item) => {
      const key = `${item.scope}:${item.name}`;
      if (exists.has(key)) return;
      exists.add(key);
      list.push(item);
    };

    const nodeExplain = this.explain('node');
    pushUnique({
      name: 'node',
      scope: 'runtime',
      declaredVersion: process.version,
      installedVersion: process.version,
      descKey: nodeExplain.descKey,
      descFallback: nodeExplain.descFallback,
    });

    const pmExplain = this.explain('package-manager');
    pushUnique({
      name: 'package-manager',
      scope: 'runtime',
      declaredVersion: effectivePm,
      installedVersion: this.resolvePackageManagerVersion(effectivePm),
      descKey: pmExplain.descKey,
      descFallback: pmExplain.descFallback,
    });

    const appendByScope = (deps, scope, manifestDir = this.projectDir) => {
      for (const [name, version] of Object.entries(deps || {})) {
        const explain = this.explain(name);
        pushUnique({
          name,
          scope,
          declaredVersion: String(version || ''),
          installedVersion: this.readInstalledVersion(name, manifestDir, scope),
          descKey: explain.descKey,
          descFallback: explain.descFallback,
        });
      }
    };

    appendByScope(pkg.dependencies, 'dependencies');
    appendByScope(pkg.optionalDependencies, 'dependencies');
    appendByScope(pkg.peerDependencies, 'dependencies');
    appendByScope(pkg.devDependencies, 'devDependencies');

    for (const pkgPath of this.findWorkspacePackageJsonPaths()) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const childPkg = JSON.parse(raw);
        const manifestDir = path.dirname(pkgPath);
        appendByScope(childPkg.dependencies, 'dependencies', manifestDir);
        appendByScope(childPkg.optionalDependencies, 'dependencies', manifestDir);
        appendByScope(childPkg.peerDependencies, 'dependencies', manifestDir);
        appendByScope(childPkg.devDependencies, 'devDependencies', manifestDir);
      } catch {
        // Ignore invalid package.json in workspace scan.
      }
    }

    return list;
  }
}

module.exports = { DependencyScanService };
