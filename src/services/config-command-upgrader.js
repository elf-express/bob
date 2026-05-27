function normalizeText(value) {
  return String(value || '').trim();
}

function buildScriptLookup(scripts) {
  const byIdentity = new Map();
  const byRaw = new Map();

  for (const script of scripts || []) {
    const identity = normalizeText(script?.name);
    const rawName = normalizeText(script?.scriptName);
    const runCmd = normalizeText(script?.runCmd || script?.cmd);

    if (!runCmd) continue;
    if (identity) byIdentity.set(identity, script);

    if (!rawName) continue;
    if (!byRaw.has(rawName)) {
      byRaw.set(rawName, script);
      continue;
    }
    // Ambiguous raw script names are intentionally ignored.
    byRaw.set(rawName, null);
  }

  return { byIdentity, byRaw };
}

function resolveScript(scriptName, lookup) {
  const key = normalizeText(scriptName);
  if (!key) return null;

  if (lookup.byIdentity.has(key)) {
    return lookup.byIdentity.get(key);
  }
  if (!lookup.byRaw.has(key)) {
    return null;
  }
  return lookup.byRaw.get(key);
}

function dedupeCommandsInCategory(category) {
  if (!Array.isArray(category?.commands) || category.commands.length <= 1) {
    return 0;
  }

  const seen = new Set();
  const deduped = [];
  let removed = 0;

  for (const command of category.commands) {
    const scriptName = normalizeText(command?.scriptName);
    const cmd = normalizeText(command?.cmd);
    const key = `${scriptName}::${cmd}`;
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    deduped.push(command);
  }

  if (removed > 0) {
    category.commands = deduped;
  }
  return removed;
}

function upgradeConfigCommandsFromScripts(config, scripts) {
  if (!config || !Array.isArray(config.groups)) {
    return { changed: false, updated: 0, deduped: 0 };
  }

  const lookup = buildScriptLookup(scripts);
  let updated = 0;
  let deduped = 0;

  for (const group of config.groups) {
    for (const category of group?.categories || []) {
      for (const command of category?.commands || []) {
        const script = resolveScript(command?.scriptName, lookup);
        if (!script) continue;

        const nextScriptName = normalizeText(script.name);
        const nextCmd = normalizeText(script.runCmd || script.cmd);
        if (!nextCmd) continue;

        let changed = false;
        if (nextScriptName && normalizeText(command.scriptName) !== nextScriptName) {
          command.scriptName = nextScriptName;
          changed = true;
        }
        if (normalizeText(command.cmd) !== nextCmd) {
          command.cmd = nextCmd;
          changed = true;
        }
        if (changed) updated += 1;
      }

      deduped += dedupeCommandsInCategory(category);
    }
  }

  return {
    changed: updated > 0 || deduped > 0,
    updated,
    deduped,
  };
}

module.exports = { upgradeConfigCommandsFromScripts };
