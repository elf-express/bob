const net = require('node:net');

/**
 * 檢查指定埠是否可用
 * @param {number} port - 埠號
 * @returns {Promise<boolean>} - true 表示可用，false 表示已佔用
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

/**
 * 從起始埠開始查找可用埠
 * @param {number} startPort - 起始埠號（預設 3800）
 * @param {number} maxAttempts - 最大嘗試次數（預設 10）
 * @returns {Promise<number>} - 可用埠號，若全部佔用返回 0
 */
async function findAvailablePort(startPort = 3800, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) return port;
  }
  return 0;
}

module.exports = {
  isPortAvailable,
  findAvailablePort,
};
