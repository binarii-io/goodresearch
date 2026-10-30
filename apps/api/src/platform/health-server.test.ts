import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { startHealthServer } from './health-server.ts'

describe('health server', () => {
  it('answers GET /health and nothing else', async () => {
    const server = await startHealthServer(0)
    const { port } = server.address() as AddressInfo
    const url = `http://127.0.0.1:${port}`
    expect((await fetch(`${url}/health`)).status).toBe(200)
    expect((await fetch(`${url}/health?probe=1`, { method: 'HEAD' })).status).toBe(200)
    expect((await fetch(`${url}/other`)).status).toBe(404)
    expect((await fetch(`${url}/health`, { method: 'POST' })).status).toBe(404)
    await new Promise((resolve) => server.close(resolve))
  })
})
