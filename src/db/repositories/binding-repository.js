class BindingRepository {
  constructor(db) {
    this.db = db;
    this._hasPackageManagerOverride = null;
  }

  async hasPackageManagerOverrideColumn() {
    if (this._hasPackageManagerOverride !== null) {
      return this._hasPackageManagerOverride;
    }

    try {
      const columns = await this.db.all('PRAGMA table_info(project_binding)');
      this._hasPackageManagerOverride = columns.some((column) => column.name === 'package_manager_override');
    } catch {
      this._hasPackageManagerOverride = false;
    }

    return this._hasPackageManagerOverride;
  }

  async getBinding() {
    const hasOverride = await this.hasPackageManagerOverrideColumn();
    const row = hasOverride
      ? await this.db.get(
        'SELECT id, target_path, bound_at, updated_at, allow_rebind, package_manager_override FROM project_binding WHERE id = 1',
      )
      : await this.db.get(
        'SELECT id, target_path, bound_at, updated_at, allow_rebind FROM project_binding WHERE id = 1',
      );

    if (!row) return null;
    if (!hasOverride) {
      return { ...row, package_manager_override: null };
    }
    return row;
  }

  async upsertBinding(targetPath, allowRebind = 1, packageManagerOverride = null) {
    const now = new Date().toISOString();
    const hasOverride = await this.hasPackageManagerOverrideColumn();

    if (hasOverride) {
      await this.db.run(
        `
        INSERT INTO project_binding (id, target_path, bound_at, updated_at, allow_rebind, package_manager_override)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          target_path = excluded.target_path,
          updated_at = excluded.updated_at,
          allow_rebind = excluded.allow_rebind,
          package_manager_override = excluded.package_manager_override
        `,
        [targetPath, now, now, allowRebind, packageManagerOverride],
      );
    } else {
      await this.db.run(
        `
        INSERT INTO project_binding (id, target_path, bound_at, updated_at, allow_rebind)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          target_path = excluded.target_path,
          updated_at = excluded.updated_at,
          allow_rebind = excluded.allow_rebind
        `,
        [targetPath, now, now, allowRebind],
      );
    }

    return await this.getBinding();
  }

  async setPackageManagerOverride(value) {
    const normalized = value && ['npm', 'pnpm', 'yarn'].includes(value) ? value : null;
    const now = new Date().toISOString();

    if (!(await this.hasPackageManagerOverrideColumn())) {
      return await this.getBinding();
    }

    await this.db.run(
      `
      UPDATE project_binding
      SET package_manager_override = ?, updated_at = ?
      WHERE id = 1
      `,
      [normalized, now],
    );

    return await this.getBinding();
  }
}

module.exports = { BindingRepository };