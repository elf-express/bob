class ScanRepository {
  constructor(db) {
    this.db = db;
  }

  async startRun(scanType) {
    const startedAt = new Date().toISOString();
    const { lastID } = await this.db.run(
      'INSERT INTO scan_runs (scan_type, started_at, status) VALUES (?, ?, ?)',
      [scanType, startedAt, 'running']
    );
    return lastID;
  }

  async finishRunSuccess(scanId) {
    await this.db.run(
      'UPDATE scan_runs SET status = ?, finished_at = ? WHERE id = ?',
      ['success', new Date().toISOString(), scanId]
    );
  }

  async finishRunFailed(scanId, errorMsg) {
    await this.db.run(
      'UPDATE scan_runs SET status = ?, finished_at = ?, error_msg = ? WHERE id = ?',
      ['failed', new Date().toISOString(), errorMsg || null, scanId]
    );
  }

  async replaceCommandSnapshot(scanId, scripts, sourceFile) {
    const createdAt = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM commands_snapshot');
      for (const item of scripts) {
        const itemSourceFile = item?.sourceFile || sourceFile;
        await tx.run(
          `
          INSERT INTO commands_snapshot (scan_id, script_name, script_cmd, source_file, created_at)
          VALUES (?, ?, ?, ?, ?)
          `,
          [scanId, item.name, item.cmd, itemSourceFile, createdAt]
        );
      }
    });
  }

  async replaceTreeSnapshot(scanId, nodes) {
    const createdAt = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM tree_snapshot');
      for (const node of nodes) {
        await tx.run(
          `
          INSERT INTO tree_snapshot (scan_id, rel_path, name, is_dir, depth, parent_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            scanId,
            node.rel_path,
            node.name,
            node.is_dir ? 1 : 0,
            node.depth,
            node.parent_path || null,
            createdAt,
          ]
        );
      }
    });
  }

  async getLatestSummary() {
    const latestRuns = await this.db.all(
      `
      SELECT scan_type, id, status, started_at, finished_at, error_msg
      FROM scan_runs
      ORDER BY id DESC
      LIMIT 20
      `
    );

    const latestByType = {};
    for (const row of latestRuns) {
      if (!latestByType[row.scan_type]) latestByType[row.scan_type] = row;
    }

    const commandCountRow = await this.db.get('SELECT COUNT(1) AS c FROM commands_snapshot');
    const treeCountRow = await this.db.get('SELECT COUNT(1) AS c FROM tree_snapshot');
    const latestUpdateRow = await this.db.get('SELECT MAX(finished_at) AS updated_at FROM scan_runs');

    return {
      runs: latestByType,
      counts: {
        commands: Number(commandCountRow?.c || 0),
        treeNodes: Number(treeCountRow?.c || 0),
        updatedAt: latestUpdateRow?.updated_at || null,
      },
    };
  }
}

module.exports = { ScanRepository };
