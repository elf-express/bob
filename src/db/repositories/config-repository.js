class ConfigRepository {
  constructor(db) {
    this.db = db;
  }

  async exists() {
    if (!this.db) return false;
    const row = await this.db.get('SELECT COUNT(1) AS c FROM app_config WHERE id = 1');
    return Number(row?.c || 0) > 0;
  }

  async getConfig() {
    if (!this.db) return null;
    const row = await this.db.get('SELECT config_json FROM app_config WHERE id = 1');
    if (!row) return null;
    return JSON.parse(row.config_json);
  }

  async upsertConfig(config) {
    if (!this.db) return;
    const now = new Date().toISOString();
    await this.db.run(
      `
      INSERT INTO app_config (id, config_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
      `,
      [JSON.stringify(config, null, 2), now]
    );
  }
}

module.exports = { ConfigRepository };
