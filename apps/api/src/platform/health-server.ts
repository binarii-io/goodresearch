import { createServer, type Server } from 'node:http'

/** Answers GET /health for platforms that require a process to listen on a port. */
export const startHealthServer = (port: number): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const ok = request.method === 'GET' && request.url === '/health'
      response.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' })
      response.end(JSON.stringify(ok ? { status: 'ok' } : { error: 'not found' }))
    })
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve(server))
  })
