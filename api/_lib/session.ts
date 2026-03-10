import jwt from 'jsonwebtoken'

import type { AdminUser } from '../../shared/contracts'
import { hasAdminAuthConfigured, type AppEnv } from './env'
import { appendSetCookie, parseCookies, sendJson, type ApiRequest, type ApiResponse } from './http'

export const SESSION_COOKIE_NAME = 'z_prompt_admin'

export interface SessionPayload extends AdminUser {
  role: 'admin'
  githubId: number
}

export function signAdminSession(env: AppEnv, user: AdminUser & { githubId: number }): string {
  if (!env.sessionSecret) {
    throw new Error('SESSION_SECRET 未配置')
  }

  return jwt.sign(
    {
      role: 'admin' satisfies SessionPayload['role'],
      githubId: user.githubId,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    env.sessionSecret,
    {
      expiresIn: '7d',
    },
  )
}

export function getAdminSession(req: ApiRequest, env: AppEnv): SessionPayload | null {
  if (!env.sessionSecret) {
    return null
  }

  const cookies = parseCookies(req)
  const token = cookies[SESSION_COOKIE_NAME]
  if (!token) {
    return null
  }

  try {
    const payload = jwt.verify(token, env.sessionSecret) as SessionPayload
    if (payload.role !== 'admin' || !payload.login || typeof payload.githubId !== 'number') {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function verifyAdminSession(req: ApiRequest, env: AppEnv): boolean {
  return Boolean(getAdminSession(req, env))
}

export function setAdminSessionCookie(res: ApiResponse, token: string, env: AppEnv): void {
  const segments = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800',
  ]

  if (env.isProduction) {
    segments.push('Secure')
  }

  appendSetCookie(res, segments.join('; '))
}

export function clearAdminSessionCookie(res: ApiResponse, env: AppEnv): void {
  const segments = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]

  if (env.isProduction) {
    segments.push('Secure')
  }

  appendSetCookie(res, segments.join('; '))
}

export function ensureAdmin(req: ApiRequest, res: ApiResponse, env: AppEnv): boolean {
  if (!hasAdminAuthConfigured(env)) {
    sendJson(res, 503, {
      error: '管理员认证未配置',
      details: '请设置 SESSION_SECRET、GITHUB_OAUTH_CLIENT_ID、GITHUB_OAUTH_CLIENT_SECRET 和 GITHUB_ADMIN_USERS',
    })
    return false
  }

  if (!verifyAdminSession(req, env)) {
    sendJson(res, 401, { error: '未登录或管理员会话已失效' })
    return false
  }

  return true
}
