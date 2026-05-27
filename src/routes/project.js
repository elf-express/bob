const express = require('express');
const path = require('node:path');

function createProjectRouter({ bindingRepo, packageManagerProvider }) {
  const router = express.Router();
  const toolDir = path.resolve(__dirname, '..', '..');

  function isToolPathOrInside(targetPath) {
    const resolved = path.resolve(String(targetPath || ''));
    return resolved === toolDir || resolved.startsWith(`${toolDir}${path.sep}`);
  }

  router.get('/status', async (_req, res) => {
    try {
      const binding = await bindingRepo.getBinding();
      res.json({
        success: true,
        data: {
          bound: Boolean(binding),
          targetPath: binding?.target_path || null,
          boundAt: binding?.bound_at || null,
          updatedAt: binding?.updated_at || null,
          allowRebind: Boolean(binding?.allow_rebind),
          packageManagerOverride: binding?.package_manager_override || null,
          effectivePackageManager: packageManagerProvider ? await packageManagerProvider() : null,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.post('/bind', async (req, res) => {
    try {
      const { targetPath, force } = req.body || {};
      if (!targetPath) {
        return res.status(400).json({ success: false, message: 'Missing targetPath' });
      }
      if (isToolPathOrInside(targetPath)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid targetPath: cannot bind to .bob-tools directory or its subdirectories',
        });
      }
      const existing = await bindingRepo.getBinding();
      if (existing && existing.target_path !== targetPath && !force) {
        return res.status(409).json({
          success: false,
          message: `Already bound to ${existing.target_path}. Use force=true to rebind.`,
        });
      }
      const binding = await bindingRepo.upsertBinding(
        targetPath,
        1,
        existing?.package_manager_override || null
      );
      return res.json({ success: true, data: binding });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  router.get('/pm-override', async (_req, res) => {
    try {
      const binding = await bindingRepo.getBinding();
      if (!binding) {
        return res.status(404).json({ success: false, message: 'Project is not bound yet' });
      }
      return res.json({
        success: true,
        data: {
          packageManagerOverride: binding.package_manager_override || null,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  router.put('/pm-override', async (req, res) => {
    try {
      const { packageManager } = req.body || {};
      if (packageManager !== null && packageManager !== undefined && !['auto', 'npm', 'pnpm', 'yarn'].includes(packageManager)) {
        return res.status(400).json({
          success: false,
          message: 'packageManager must be one of: auto, npm, pnpm, yarn',
        });
      }
      const normalized = packageManager === 'auto' ? null : packageManager || null;
      const binding = await bindingRepo.getBinding();
      if (!binding) {
        return res.status(404).json({ success: false, message: 'Project is not bound yet' });
      }
      const updated = await bindingRepo.setPackageManagerOverride(normalized);
      return res.json({
        success: true,
        data: {
          packageManagerOverride: updated?.package_manager_override || null,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { createProjectRouter };
