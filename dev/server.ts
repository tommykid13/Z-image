import { createServer } from 'node:http'

import callbackHandler from '../api/auth/github/callback'
import imageHandler from '../api/image'
import loginHandler from '../api/login'
import logoutHandler from '../api/logout'
import promptsHandler from '../api/prompts'
import importHandler from '../api/prompts/import'
import saveHandler from '../api/prompts/save'
import uploadImageHandler from '../api/upload-image'
import type { ApiRequest, ApiResponse } from '../api/_lib/http'

type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>

const PORT = Number(process.env.DEV_API_PORT || 4321)

const routes = new Map<string, RouteHandler>([
  ['GET /api/prompts', promptsHandler],
  ['GET /api/login', loginHandler],
  ['GET /api/auth/github/callback', callbackHandler],
  ['POST /api/logout', logoutHandler],
  ['POST /api/prompts/save', saveHandler],
  ['POST /api/prompts/import', importHandler],
  ['POST /api/upload-image', uploadImageHandler],
  ['GET /api/image', imageHandler],
])

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const key = `${req.method || 'GET'} ${url.pathname}`
  const handler = routes.get(key)

  if (!handler) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Not Found' }))
    return
  }

  try {
    await handler(req as ApiRequest, res as ApiResponse)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: '开发服务器异常',
        details: error instanceof Error ? error.message : 'unknown error',
      }),
    )
  }
})

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`)
})
