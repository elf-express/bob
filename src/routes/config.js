const express = require('express')
const fs = require('node:fs')
const os = require('node:os')
const multer = require('multer')
const path = require('path')
const { ConfigEditor, validateConfig } = require('../services/config-editor.js')
const { validateFileName } = require('../utils/validation.js')

const IMPORT_MAX_FILE_SIZE = 1024 * 1024

function ensureBackupDir(backupDir) {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
}

function makeBackupName() {
  const now = new Date()
  return (
    'bob.config.' +
    now.toISOString().replace(/:/g, '-').replace(/\..+/, '') +
    '-' +
    now.getMilliseconds().toString().padStart(3, '0') +
    '.json'
  )
}

function writeConfigBackup(backupDir, config) {
  ensureBackupDir(backupDir)
  const backupName = makeBackupName()
  fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(config, null, 2), 'utf8')
  return backupName
}

function listBackupNames(backupDir) {
  ensureBackupDir(backupDir)
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('bob.config.') && f.endsWith('.json'))
    .sort()
    .reverse()
}

// 在備份目錄列表中找出與 name 相同的檔名，找不到時回傳 undefined
function findBackupName(backupDir, name) {
  return listBackupNames(backupDir).find((f) => f === name)
}

function listBackups(backupDir) {
  return listBackupNames(backupDir).map((name) => {
    const stat = fs.statSync(path.join(backupDir, name))
    return {
      name,
      size: stat.size,
      time: stat.mtime.toISOString(),
    }
  })
}

/**
 * options:
 * - dbMode: when db + configRepo provided
 * - fileMode fallback: configPath + backupDir
 */
function createConfigRouter(options) {
  const router = express.Router()
  const upload = multer({ dest: os.tmpdir(), limits: { fileSize: IMPORT_MAX_FILE_SIZE } })

  const { db, configRepo, configPath, backupDir } = options
  const dbMode = Boolean(db && configRepo)
  const editor = !dbMode ? new ConfigEditor(configPath, backupDir) : null

  router.get('/', async (_req, res) => {
    try {
      if (dbMode) {
        const config = await configRepo.getConfig()
        if (!config) throw new Error('Configuration not found in database')
        return res.json(config)
      }
      return res.json(editor.load())
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })

  router.put('/', async (req, res) => {
    try {
      const config = req.body
      if (dbMode) {
        const { valid, errors } = validateConfig(config)
        if (!valid) return res.status(400).json({ error: `Invalid configuration: ${errors.join('; ')}` })
        const prev = await configRepo.getConfig()
        if (prev) writeConfigBackup(backupDir, prev)
        await configRepo.upsertConfig(config)
        return res.json({ ok: true, message: 'Configuration saved successfully' })
      }
      editor.save(config)
      return res.json({ ok: true, message: 'Configuration saved successfully' })
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  router.post('/validate', async (req, res) => {
    try {
      const result = dbMode ? validateConfig(req.body) : editor.validate(req.body)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  router.get('/backups', (_req, res) => {
    try {
      const backups = dbMode ? listBackups(backupDir) : editor.listBackups()
      return res.json({ backups })
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })

  router.get('/backups/:name', (req, res) => {
    const { name } = req.params
    if (!validateFileName(name)) {
      return res.status(400).json({ error: 'Invalid backup name' })
    }
    const match = findBackupName(backupDir, name)
    if (!match) {
      return res.status(404).json({ error: 'Backup not found' })
    }
    const backupPath = path.join(backupDir, match)
    return res.download(backupPath, match, (err) => {
      if (err) res.status(404).json({ error: 'Backup not found' })
    })
  })

  router.post('/restore/:name', async (req, res) => {
    const { name } = req.params
    if (!validateFileName(name)) {
      return res.status(400).json({ error: 'Invalid backup name' })
    }
    try {
      if (dbMode) {
        const match = findBackupName(backupDir, name)
        if (!match) throw new Error(`Backup not found: ${name}`)
        const raw = fs.readFileSync(path.join(backupDir, match), 'utf8')
        const config = JSON.parse(raw)
        const { valid, errors } = validateConfig(config)
        if (!valid) return res.status(400).json({ error: `Invalid configuration: ${errors.join('; ')}` })
        const prev = await configRepo.getConfig()
        if (prev) writeConfigBackup(backupDir, prev)
        await configRepo.upsertConfig(config)
      } else {
        editor.restore(name)
      }
      return res.json({ ok: true, message: 'Configuration restored successfully' })
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  router.delete('/backups/:name', (req, res) => {
    const { name } = req.params
    if (!validateFileName(name)) {
      return res.status(400).json({ error: 'Invalid backup name' })
    }
    try {
      if (dbMode) {
        const match = findBackupName(backupDir, name)
        if (!match) throw new Error(`Backup not found: ${name}`)
        fs.unlinkSync(path.join(backupDir, match))
      } else {
        editor.deleteBackup(name)
      }
      return res.json({ ok: true, message: 'Backup deleted successfully' })
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  })

  // 上傳檔超過大小上限時回 413，其餘 multer 錯誤回 400
  const uploadImportFile = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next()
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' })
      }
      return res.status(400).json({ error: err.message })
    })
  }

  router.post('/import', uploadImportFile, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }
      const raw = fs.readFileSync(req.file.path, 'utf8')
      const config = JSON.parse(raw)
      const { valid, errors } = dbMode ? validateConfig(config) : editor.validate(config)
      if (!valid) {
        fs.unlinkSync(req.file.path)
        return res.status(400).json({ error: 'Invalid configuration', errors })
      }

      if (dbMode) {
        const prev = await configRepo.getConfig()
        if (prev) writeConfigBackup(backupDir, prev)
        await configRepo.upsertConfig(config)
      } else {
        editor.save(config)
      }
      fs.unlinkSync(req.file.path)
      return res.json({ ok: true, message: 'Configuration imported successfully' })
    } catch (error) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
        } catch {
          // 暫存上傳檔可能已不存在，刪除失敗不影響回應
        }
      }
      return res.status(400).json({ error: error.message })
    }
  })

  router.get('/export', async (_req, res) => {
    try {
      let configData
      if (dbMode) {
        const config = await configRepo.getConfig()
        if (!config) return res.status(404).json({ error: 'Configuration not found' })
        configData = JSON.stringify(config, null, 2)
      } else {
        if (!fs.existsSync(configPath)) return res.status(404).json({ error: 'Configuration file not found' })
        configData = fs.readFileSync(configPath, 'utf-8')
      }
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename="bob.config.json"')
      return res.send(configData)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })

  return router
}

module.exports = { createConfigRouter }
