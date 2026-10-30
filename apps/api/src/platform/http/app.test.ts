import { describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'

const clientIp = async (trustProxy: readonly string[], forwardedFor: string) => {
  const app = await buildApp({
    logger: false,
    trustProxy,
    isReady: async () => true,
    register: (a) => a.get('/ip', async (request) => ({ ip: request.ip })),
  })
  const response = await app.inject({
    url: '/ip',
    headers: { 'x-forwarded-for': forwardedFor },
    remoteAddress: '169.254.1.1',
  })
  await app.close()
  return (response.json() as { ip: string }).ip
}

describe('client IP behind proxies', () => {
  it('ignores forwarded addresses when no proxy is trusted', async () => {
    expect(await clientIp([], '203.0.113.7')).toBe('169.254.1.1')
  })

  it('trusts listed proxy addresses', async () => {
    expect(await clientIp(['169.254.0.0/16'], '203.0.113.7')).toBe('203.0.113.7')
  })

  it('takes the address the trusted proxy saw, not one the client forged', async () => {
    expect(await clientIp(['169.254.0.0/16'], '198.51.100.9, 203.0.113.7')).toBe('203.0.113.7')
  })
})
