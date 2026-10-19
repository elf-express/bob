import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { findAvailablePort, isPortAvailable } from './port.js'

function listenOnFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

describe('isPortAvailable', () => {
  let servers = []

  afterEach(async () => {
    await Promise.all(servers.map(close))
    servers = []
  })

  it('reports a port held by another server as unavailable', async () => {
    const server = await listenOnFreePort()
    servers.push(server)

    const available = await isPortAvailable(server.address().port)

    expect(available).toBe(false)
  })

  it('reports a released port as available', async () => {
    const server = await listenOnFreePort()
    const { port } = server.address()
    await close(server)

    const available = await isPortAvailable(port)

    expect(available).toBe(true)
  })
})

describe('findAvailablePort', () => {
  let servers = []

  afterEach(async () => {
    await Promise.all(servers.map(close))
    servers = []
  })

  it('skips an occupied start port', async () => {
    const server = await listenOnFreePort()
    servers.push(server)
    const { port } = server.address()

    const found = await findAvailablePort(port, 10)

    expect(found).toBeGreaterThan(port)
  })

  it('returns 0 when every attempted port is taken', async () => {
    const server = await listenOnFreePort()
    servers.push(server)

    const found = await findAvailablePort(server.address().port, 1)

    expect(found).toBe(0)
  })

  it('returns 0 when maxAttempts is 0', async () => {
    expect(await findAvailablePort(3800, 0)).toBe(0)
  })
})
