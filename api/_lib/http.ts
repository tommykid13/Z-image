import { URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type ApiRequest = IncomingMessage & { body?: unknown }
export type ApiResponse = ServerResponse

export async function readRequestBody(req: ApiRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    return req.body
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body)
  }

  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body))
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function readJsonBody<T>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as T
  }

  const raw = await readRequestBody(req)
  if (!raw.length) {
    throw new Error('请求体为空')
  }

  return JSON.parse(raw.toString('utf8')) as T
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export function sendText(res: ApiResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

export function methodNotAllowed(res: ApiResponse, allow: string[]): void {
  res.setHeader('Allow', allow.join(', '))
  sendJson(res, 405, { error: 'Method Not Allowed' })
}

export function parseCookies(req: ApiRequest): Record<string, string> {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) {
    return {}
  }

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=')
        if (separator < 0) {
          return [part, '']
        }
        const key = part.slice(0, separator).trim()
        const value = decodeURIComponent(part.slice(separator + 1))
        return [key, value]
      }),
  )
}

export function appendSetCookie(res: ApiResponse, value: string): void {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', value)
    return
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current.map(String), value])
    return
  }

  res.setHeader('Set-Cookie', [String(current), value])
}

export function getRequestUrl(req: ApiRequest): URL {
  const origin = `http://${req.headers.host || 'localhost'}`
  return new URL(req.url || '/', origin)
}
