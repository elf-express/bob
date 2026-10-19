const LOCAL_HOST_PATTERN = /^(127\.0\.0\.1|localhost)(:\d+)?$/i
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function forbidden(res) {
  return res.status(403).json({ error: 'Forbidden' })
}

// 只接受 Host 為 127.0.0.1／localhost 的請求；會改變狀態的請求若帶 Origin，Origin 的 host 必須等於 Host，
// 且 Sec-Fetch-Site 為 cross-site 時一律拒絕
function localOriginGuard(req, res, next) {
  const host = String(req.headers.host || '').toLowerCase()
  if (!LOCAL_HOST_PATTERN.test(host)) return forbidden(res)

  if (SAFE_METHODS.has(req.method)) return next()

  if (req.headers['sec-fetch-site'] === 'cross-site') return forbidden(res)

  const origin = req.headers.origin
  if (origin === undefined) return next()

  let originHost
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return forbidden(res)
  }
  if (originHost !== host) return forbidden(res)

  return next()
}

module.exports = { localOriginGuard }
