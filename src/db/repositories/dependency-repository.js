class DependencyRepository {
  constructor(db) {
    this.db = db;
  }

  async list({ scope, q } = {}) {
    const where = [];
    const params = [];
    if (scope && ['dependencies', 'devDependencies', 'runtime'].includes(scope)) {
      where.push('scope = ?');
      params.push(scope);
    }
    if (q) {
      where.push('LOWER(name) LIKE ?');
      params.push(`%${String(q).toLowerCase()}%`);
    }
    const sql = `
      SELECT
        name,
        scope,
        declared_version,
        installed_version,
        first_seen_at,
        last_seen_at,
        last_changed_at,
        desc_key,
        desc_fallback,
        desc_mode,
        manual_desc,
        note_text
      FROM dependency_inventory
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE scope
          WHEN 'runtime' THEN 0
          WHEN 'dependencies' THEN 1
          ELSE 2
        END,
        LOWER(name)
    `;
    return await this.db.all(sql, params);
  }

  async getMeta() {
    const row = await this.db.get(
      'SELECT MAX(last_seen_at) AS last_scan_at, COUNT(1) AS total FROM dependency_inventory'
    );
    return {
      lastScanAt: row?.last_scan_at || null,
      total: Number(row?.total || 0),
    };
  }

  async upsertBatch(items, scanAt) {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const now = scanAt || new Date().toISOString();

    await this.db.transaction(async (tx) => {
      for (const item of items || []) {
        const existing = await tx.get(
          `
          SELECT
            declared_version,
            installed_version,
            desc_mode
          FROM dependency_inventory
          WHERE name = ? AND scope = ?
          `,
          [item.name, item.scope]
        );

        if (!existing) {
          await tx.run(
            `
            INSERT INTO dependency_inventory (
              name,
              scope,
              declared_version,
              installed_version,
              first_seen_at,
              last_seen_at,
              last_changed_at,
              desc_key,
              desc_fallback,
              desc_mode,
              manual_desc,
              note_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', '', '')
            `,
            [
              item.name,
              item.scope,
              item.declaredVersion || null,
              item.installedVersion || null,
              now,
              now,
              now,
              item.descKey || null,
              item.descFallback || null,
            ]
          );
          added += 1;
          continue;
        }

        const changed = (existing.declared_version || '') !== (item.declaredVersion || '')
          || (existing.installed_version || '') !== (item.installedVersion || '');
        const autoMode = existing.desc_mode !== 'manual';

        const fields = [
          'declared_version = ?',
          'installed_version = ?',
          'last_seen_at = ?',
        ];
        const params = [
          item.declaredVersion || null,
          item.installedVersion || null,
          now,
        ];

        if (changed) {
          fields.push('last_changed_at = ?');
          params.push(now);
        }

        if (autoMode) {
          fields.push('desc_key = ?', 'desc_fallback = ?');
          params.push(item.descKey || null, item.descFallback || null);
        }

        params.push(item.name, item.scope);

        await tx.run(
          `
          UPDATE dependency_inventory
          SET ${fields.join(', ')}
          WHERE name = ? AND scope = ?
          `,
          params
        );

        if (changed) updated += 1;
        else unchanged += 1;
      }
    });

    return { added, updated, unchanged };
  }

  async updateDescriptionMode({ name, scope, mode, manualDesc, noteText }) {
    const safeMode = mode === 'manual' ? 'manual' : 'auto';
    const safeManual = safeMode === 'manual' ? String(manualDesc || '').trim() : '';
    const safeNote = String(noteText || '').trim();
    await this.db.run(
      `
      UPDATE dependency_inventory
      SET desc_mode = ?, manual_desc = ?, note_text = ?
      WHERE name = ? AND scope = ?
      `,
      [safeMode, safeManual, safeNote, name, scope]
    );
    return await this.db.get(
      `
      SELECT
        name,
        scope,
        declared_version,
        installed_version,
        first_seen_at,
        last_seen_at,
        last_changed_at,
        desc_key,
        desc_fallback,
        desc_mode,
        manual_desc,
        note_text
      FROM dependency_inventory
      WHERE name = ? AND scope = ?
      `,
      [name, scope]
    );
  }

  async updateNote({ name, scope, noteText }) {
    const safeNote = String(noteText || '').trim();
    await this.db.run(
      `
      UPDATE dependency_inventory
      SET note_text = ?
      WHERE name = ? AND scope = ?
      `,
      [safeNote, name, scope]
    );
    return await this.db.get(
      `
      SELECT
        name,
        scope,
        declared_version,
        installed_version,
        first_seen_at,
        last_seen_at,
        last_changed_at,
        desc_key,
        desc_fallback,
        desc_mode,
        manual_desc,
        note_text
      FROM dependency_inventory
      WHERE name = ? AND scope = ?
      `,
      [name, scope]
    );
  }
}

module.exports = { DependencyRepository };
