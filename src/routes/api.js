const express = require('express');

function createApiRouter(options) {
  const router = express.Router();
  const { config, packageManager, packageManagerProvider, configProvider } = options;

  router.get('/data', async (_req, res) => {
    const runtimeConfig = configProvider ? await configProvider() : config;
    const effectivePm = packageManagerProvider ? await packageManagerProvider() : packageManager;

    let flatCategories = [];
    if (runtimeConfig?.groups) {
      runtimeConfig.groups.forEach((group) => {
        if (group.categories) {
          const processedCategories = group.categories.map((cat) => ({
            ...cat,
            commands: cat.commands?.map((cmd) => ({
              ...cmd,
              cmd: cmd.cmd.replace(/\{\{PKG_MANAGER\}\}/g, effectivePm),
            })),
          }));
          flatCategories.push(...processedCategories);
        }
      });
    } else if (runtimeConfig?.categories) {
      flatCategories = runtimeConfig.categories.map((cat) => ({
        ...cat,
        commands: cat.commands?.map((cmd) => ({
          ...cmd,
          cmd: cmd.cmd.replace(/\{\{PKG_MANAGER\}\}/g, effectivePm),
        })),
      }));
    }

    const processedGroups = runtimeConfig?.groups?.map((group) => ({
      ...group,
      categories: group.categories?.map((cat) => ({
        ...cat,
        commands: cat.commands?.map((cmd) => ({
          ...cmd,
          cmd: cmd.cmd.replace(/\{\{PKG_MANAGER\}\}/g, effectivePm),
        })),
      })),
    }));

    res.json({
      config: {
        ...runtimeConfig,
        groups: processedGroups,
        packageManager: effectivePm,
      },
      categories: flatCategories,
    });
  });

  return router;
}

module.exports = { createApiRouter };
