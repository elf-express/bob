const express = require('express');
const { LogStore } = require('../db/index.js');
const { stripAnsi } = require('../utils/format.js');
const { validateFileName } = require('../utils/validation.js');

/**
 * 創建日誌管理路由
 * @param {Object} options - 配置選項
 * @param {string} options.logDir - 日誌目錄路徑
 * @returns {express.Router} - Express Router
 */
function createLogsRouter(options) {
  const router = express.Router();
  const { logDir } = options;
  const logStore = new LogStore(logDir);

  /**
   * GET /api/logs
   * 獲取日誌文件列表（最近 100 個）
   * @returns {Array} 日誌文件陣列
   */
  router.get('/logs', (req, res) => {
    try {
      const files = logStore.listFileNames(100);
      
      // 返回陣列格式（前端期望）
      const logs = files.map((f) => {
        const stats = logStore.statLog(f);

        // 從文件內容中解析命令和執行時長
        let command = '';
        let duration = 0;
        let exitCode = 0;

        // 執行者偵測:檔名 suffix 是權威來源
        //
        // 新命名格式(2026-05-27 改版,timestamp 在前):
        //   <ts>-ai.log       → AI 主 Claude session(.claude/hooks/log-bash-to-bob.mjs)
        //   <ts>-agent.log    → Agent (Claude Code subagent)
        //   <ts>-<slug>.log   → human + 動態 username slug(command-runner.js + getUserSlug)
        //
        // 向後相容(舊命名):
        //   ai-<ts>.log       → ai
        //   agent-<ts>.log    → agent
        //   <ts>.log          → human (無 suffix)
        //
        // source 是「分類」(ai/agent/human),userLabel 是「顯示文字」
        //   - ai/agent → userLabel 與 source 同(前端顯示固定 i18n)
        //   - human    → userLabel 為動態 slug(可能是 git user.name / TW199501 / 楊清雲)
        let source = 'human';
        let userLabel = '';

        // 嚴格匹配新格式:YYYY-MM-DD_HH-MM-SS(-mmm)?-<suffix>.log
        // suffix 是 alphanumeric/底線/中文等(.+ 貪婪,允許含底線的 username)
        // 不可 .+ 過於貪婪(否則會把 hh-mm-ss 的最後 ss 當 suffix)→ timestamp 必須嚴格匹配
        const newFormatMatch = f.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d{3})?-(.+)\.log$/);
        if (newFormatMatch) {
          const suffix = newFormatMatch[1];
          if (suffix === 'ai') {
            source = 'ai';
          } else if (suffix === 'agent') {
            source = 'agent';
          } else {
            source = 'human';
            userLabel = suffix;
          }
        } else if (f.startsWith('ai-')) {
          // 向後相容:舊 prefix 格式
          source = 'ai';
        } else if (f.startsWith('agent-')) {
          source = 'agent';
        }
        // 舊 human 格式 <ts>.log 不會 match 上述任何條件 → 維持 source='human', userLabel=''

        try {
          let content = logStore.readLog(f);

          // 移除 ANSI 顏色碼
          content = stripAnsi(content);

          // 二次校驗:log 內容若有 Source: 行,以內容為準(避免人工改檔名後識別錯)
          // 判斷順序:agent / subagent 必須先判,因為 hook 寫 "Source: Agent (Claude Code subagent: xxx)"
          // 內含 "claude",若先比對 claude 會誤判成 ai。
          const sourceMatch = content.match(/^Source:\s*(.+)$/m);
          if (sourceMatch) {
            const txt = sourceMatch[1].toLowerCase();
            if (txt.includes('agent') || txt.includes('subagent')) source = 'agent';
            else if (txt.includes('claude') || /\bai\b/.test(txt)) source = 'ai';
          }
          
          // 解析命令（第一個 [n/m] 行）
          const commandMatch = content.match(/\[\d+\/\d+\]\s+(.+)/m);
          if (commandMatch) {
            command = commandMatch[1].trim();
          }
          
          // 解析執行時長（優先匹配新格式 [DURATION: XXXms]）
          const durationNewMatch = content.match(/\[DURATION:\s*(\d+)ms\]/i);
          if (durationNewMatch) {
            duration = parseInt(durationNewMatch[1], 10);
          } else {
            // 兼容舊格式 vitest 的 Duration 行
            const durationOldMatch = content.match(/Duration\s+([\d.]+)(ms|s)/);
            if (durationOldMatch) {
              const value = parseFloat(durationOldMatch[1]);
              const unit = durationOldMatch[2];
              if (unit === 'ms') {
                duration = Math.round(value);
              } else if (unit === 's') {
                duration = Math.round(value * 1000);
              }
            }
          }
          
          // 解析退出碼
          const exitMatch = content.match(/\[EXIT CODE:\s*(\d+)\]/m);
          if (exitMatch) {
            exitCode = parseInt(exitMatch[1], 10);
          }
        } catch (err) {
          console.warn(`Failed to parse log file ${f}:`, err.message);
        }
        
        // 如果沒有解析到命令，使用檔名
        if (!command) {
          command = f.replace('.log', '');
        }
        
        return {
          filename: f,
          timestamp: stats.mtime.toISOString(),
          command: command,
          exitCode: exitCode,
          duration: duration,
          size: stats.size,
          source: source,
          userLabel: userLabel, // human 才有值(動態 username);ai/agent 為空
        };
      });
      
      res.json(logs);
    } catch {
      res.json([]);
    }
  });

  /**
   * GET /api/logs/:name
   * 下載指定日誌文件
   */
  router.get('/logs/:name', (req, res) => {
    const name = req.params.name;
    
    // 安全檢查：防止路徑遍歷攻擊
    if (!validateFileName(name)) {
      return res.status(400).json({ error: 'invalid name' });
    }

    const logPath = logStore.logExists(name) ? name : null;
    
    if (!logPath) {
      return res.status(404).json({ error: 'not found' });
    }

    // 設置下載響應頭
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    
    // 讀取並移除 ANSI 顏色碼
    const content = stripAnsi(logStore.readLog(name));
    
    res.send(content);
  });

  /**
   * DELETE /api/logs/clear
   * 清空所有日誌文件
   */
  router.delete('/logs/clear', (req, res) => {
    try {
      const deleted = logStore.clearAll();
      res.json({ ok: true, deleted });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/logs/:name
   * 刪除指定日誌文件
   */
  router.delete('/logs/:name', (req, res) => {
    const name = req.params.name;
    
    // 安全檢查：防止路徑遍歷攻擊
    if (!validateFileName(name)) {
      return res.status(400).json({ error: 'invalid name' });
    }

    const logPath = logStore.logExists(name) ? name : null;
    
    if (!logPath) {
      return res.status(404).json({ error: 'not found' });
    }

    try {
      logStore.deleteLog(name);
      res.json({ success: true, message: `Deleted ${name}` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createLogsRouter };
