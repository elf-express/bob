import { describe, expect, it, vi } from 'vitest'

import { localOriginGuard } from './local-origin-guard.js'

function run(req) {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  const next = vi.fn()
  localOriginGuard({ method: 'GET', headers: {}, ...req }, res, next)
  return { res, next }
}

describe('localOriginGuard', () => {
  it.each(['127.0.0.1:3800', 'localhost', 'LOCALHOST:80'])('lets a GET with Host %s through', (host) => {
    const { next } = run({ headers: { host } })

    expect(next).toHaveBeenCalledOnce()
  })

  it.each(['', 'evil.com', '127.0.0.1.evil.com', '10.0.0.1:3800'])('rejects Host %j with 403', (host) => {
    const { res, next } = run({ headers: { host } })

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a cross-site POST', () => {
    const { res } = run({
      method: 'POST',
      headers: { host: 'localhost:3800', 'sec-fetch-site': 'cross-site' },
    })

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('lets a POST without Origin through', () => {
    const { next } = run({ method: 'POST', headers: { host: 'localhost:3800' } })

    expect(next).toHaveBeenCalledOnce()
  })

  it('lets a POST whose Origin matches Host through', () => {
    const { next } = run({
      method: 'POST',
      headers: { host: 'localhost:3800', origin: 'http://localhost:3800' },
    })

    expect(next).toHaveBeenCalledOnce()
  })

  it.each(['http://evil.com', 'http://localhost:9999', 'not a url'])(
    'rejects a POST with Origin %s',
    (origin) => {
      const { res, next } = run({ method: 'POST', headers: { host: 'localhost:3800', origin } })

      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    },
  )
})
