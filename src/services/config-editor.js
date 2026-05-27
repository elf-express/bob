const { ConfigStore } = require('../db/index.js');

function validateConfig(config) {
  const errors = [];

  if (!config.projectName || typeof config.projectName !== 'string') {
    errors.push('Missing or invalid "projectName" field');
  }

  const hasGroups = Array.isArray(config.groups);
  const hasCategories = Array.isArray(config.categories);
  if (!hasGroups && !hasCategories) {
    errors.push('"groups" or "categories" must be an array');
    return { valid: false, errors };
  }

  let allCategories = [];
  if (hasGroups) {
    const groupIds = new Set();
    for (const group of config.groups) {
      if (!group.name || typeof group.name !== 'string') {
        errors.push(`Group "${group.id || 'unknown'}" missing or invalid "name"`);
      }
      if (group.id) {
        if (groupIds.has(group.id)) {
          errors.push(`Duplicate group ID: "${group.id}"`);
        }
        groupIds.add(group.id);
      }
      if (Array.isArray(group.categories)) {
        allCategories = allCategories.concat(group.categories);
      }
    }
  } else {
    allCategories = config.categories;
  }

  if (hasGroups) {
    for (const group of config.groups) {
      const groupCategoryIds = new Set();
      for (const cat of group.categories || []) {
        if (!cat.id) continue;
        if (groupCategoryIds.has(cat.id)) {
          errors.push(`Duplicate category ID in group "${group.id || group.name || 'unknown'}": "${cat.id}"`);
        }
        groupCategoryIds.add(cat.id);
      }
    }
  } else {
    const ids = new Set();
    for (const cat of allCategories) {
      if (!cat.id) continue;
      if (ids.has(cat.id)) {
        errors.push(`Duplicate category ID: "${cat.id}"`);
      }
      ids.add(cat.id);
    }
  }

  for (const cat of allCategories) {
    if (!cat.name || typeof cat.name !== 'string') {
      errors.push(`Category "${cat.id || 'unknown'}" missing or invalid "name"`);
    }
    if (!Array.isArray(cat.commands)) {
      errors.push(`Category "${cat.id || 'unknown'}" missing "commands" array`);
      continue;
    }
    for (const cmd of cat.commands) {
      if (!cmd.cmd || typeof cmd.cmd !== 'string') {
        errors.push(`Category "${cat.id || 'unknown'}" has command missing or invalid "cmd" field`);
      }
      if (!cmd.desc || typeof cmd.desc !== 'string') {
        errors.push(`Category "${cat.id || 'unknown'}" has command missing or invalid "desc" field`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

class ConfigEditor {
  constructor(configPath, backupDir) {
    this.store = new ConfigStore(configPath, backupDir);
    this.store.ensureBackupDir();
  }

  load() {
    if (!this.store.configExists()) {
      throw new Error(`Configuration file not found: ${this.store.configPath}`);
    }
    return this.store.loadConfig();
  }

  validate(config) {
    return validateConfig(config);
  }

  save(config) {
    const { valid, errors } = this.validate(config);
    if (!valid) {
      throw new Error(`Invalid configuration: ${errors.join('; ')}`);
    }
    if (this.store.configExists()) {
      this.backup();
    }
    this.store.saveConfig(config);
  }

  backup() {
    if (!this.store.configExists()) {
      throw new Error('Cannot backup: configuration file does not exist');
    }
    const now = new Date();
    const timestamp =
      now.toISOString().replace(/:/g, '-').replace(/\..+/, '') +
      '-' +
      now.getMilliseconds().toString().padStart(3, '0');
    const backupName = `bob.config.${timestamp}.json`;
    this.store.createBackup(backupName);
    return backupName;
  }

  listBackups() {
    return this.store.listBackups();
  }

  restore(backupName) {
    if (this.store.configExists()) {
      this.backup();
    }
    this.store.restoreBackup(backupName);
  }

  deleteBackup(backupName) {
    this.store.deleteBackup(backupName);
  }
}

module.exports = { ConfigEditor, validateConfig };
