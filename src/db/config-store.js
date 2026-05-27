const fs = require('node:fs');
const path = require('node:path');

/**
 * ConfigStore (file-mode only)
 * Used when the app runs without SQLite and falls back to bob.config.json.
 */
class ConfigStore {
  /**
   * @param {string} configPath - path to bob.config.json
   * @param {string} backupDir - backup directory path
   */
  constructor(configPath, backupDir) {
    this.configPath = configPath;
    this.backupDir = backupDir;
  }

  /**
   * Load config JSON from file.
   * @returns {object}
   */
  loadConfig() {
    const raw = fs.readFileSync(this.configPath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Save config JSON to file.
   * @param {object} config
   */
  saveConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * @returns {boolean}
   */
  configExists() {
    return fs.existsSync(this.configPath);
  }

  /**
   * Ensure backup directory exists.
   */
  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create backup from current config file.
   * @param {string} backupName
   */
  createBackup(backupName) {
    const backupPath = path.join(this.backupDir, backupName);
    fs.copyFileSync(this.configPath, backupPath);
  }

  /**
   * List config backups.
   * @returns {Array<{name: string, size: number, time: string}>}
   */
  listBackups() {
    this.ensureBackupDir();

    const files = fs
      .readdirSync(this.backupDir)
      .filter((f) => f.startsWith('bob.config.') && f.endsWith('.json'))
      .sort()
      .reverse();

    return files.map((name) => {
      const filePath = path.join(this.backupDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        time: stat.mtime.toISOString(),
      };
    });
  }

  /**
   * Restore from a backup file.
   * @param {string} backupName
   */
  restoreBackup(backupName) {
    const backupPath = path.join(this.backupDir, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupName}`);
    }
    fs.copyFileSync(backupPath, this.configPath);
  }

  /**
   * Delete a backup file.
   * @param {string} backupName
   */
  deleteBackup(backupName) {
    const backupPath = path.join(this.backupDir, backupName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupName}`);
    }
    fs.unlinkSync(backupPath);
  }
}

module.exports = { ConfigStore };
