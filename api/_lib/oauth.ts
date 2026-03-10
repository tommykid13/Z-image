import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import jwt from 'jsonwebtoken'

import type { AppEnv } from './env'
import { appendSetCookie, getRequestUrl, parseCookies, type ApiRequest, type ApiResponse } from './http'

export const OAUTH_STATE_COOKIE_NAME = 'z_prompt_oauth'

interface OAuthStatePayload {
  nonce: string
  nextPath: string
  codeVerifier: string
  redirectUri: string
}

export interface GitHubOAuthUser {
  id: number
  login: string
  name: string | null
  avatarUrl?: string
}

function compareStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function getRequestOrigin(req: ApiRequest): string {
  const protoHeader = req.headers['x-forwarded-proto']
  const forwardedProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  const proto = forwardedProto?.split(',')[0] || ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http')

  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader

  return `${proto}://${host}`
}

export function getGitHubOAuthRedirectUri(req: ApiRequest, env: AppEnv): string {
  return env.githubOAuthRedirectUri || `${getRequestOrigin(req)}/api/auth/github/callback`
}

export function normalizeNextPath(input: string | null | undefined): string {
  if (!input || !input.startsWith('/') || input.startsWith('//')) {
    return '/?admin=1'
  }

  return input
}

export function beginGitHubOAuth(req: ApiRequest, res: ApiResponse, env: AppEnv): string {
  if (!env.sessionSecret || !env.githubOAuthClientId) {
    throw new Error('GitHub OAuth 未配置完整')
  }

  const nextPath = normalizeNextPath(getRequestUrl(req).searchParams.get('next'))
  const nonce = randomBytes(16).toString('hex')
  const codeVerifier = randomBytes(32).toString('base64url')
  const redirectUri = getGitHubOAuthRedirectUri(req, env)
  const cookieToken = jwt.sign(
    {
      nonce,
      nextPath,
      codeVerifier,
      redirectUri,
    } satisfies OAuthStatePayload,
    env.sessionSecret,
    { expiresIn: '10m' },
  )

  const segments = [
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(cookieToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
  ]

  if (env.isProduction) {
    segments.push('Secure')
  }

  appendSetCookie(res, segments.join('; '))

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', env.githubOAuthClientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'read:user')
  url.searchParams.set('state', nonce)
  url.searchParams.set('allow_signup', 'false')
  url.searchParams.set('code_challenge', createCodeChallenge(codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}

export function clearOAuthStateCookie(res: ApiResponse, env: AppEnv): void {
  const segments = [
    `${OAUTH_STATE_COOKIE_NAME}=`,
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

export function consumeGitHubOAuthState(req: ApiRequest, env: AppEnv, state: string): OAuthStatePayload {
  if (!env.sessionSecret) {
    throw new Error('SESSION_SECRET 未配置')
  }

  const cookies = parseCookies(req)
  const token = cookies[OAUTH_STATE_COOKIE_NAME]
  if (!token) {
    throw new Error('OAuth 状态已失效，请重新发起登录')
  }

  const payload = jwt.verify(token, env.sessionSecret) as OAuthStatePayload
  if (!payload.nonce || !payload.codeVerifier || !payload.redirectUri) {
    throw new Error('OAuth 状态无效，请重新发起登录')
  }

  if (!compareStrings(payload.nonce, state)) {
    throw new Error('OAuth state 校验失败，请重试')
  }

  return payload
}

export async function exchangeGitHubCodeForToken(params: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'z-image-prompt',
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  })

  const payload = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'GitHub OAuth token 交换失败')
  }

  return payload.access_token
}

export async function fetchGitHubOAuthUser(accessToken: string): Promise<GitHubOAuthUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'z-image-prompt',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  const payload = (await response.json()) as {
    id?: number
    login?: string
    name?: string | null
    avatar_url?: string
    message?: string
  }

  if (!response.ok || !payload.id || !payload.login) {
    throw new Error(payload.message || '读取 GitHub 用户信息失败')
  }

  return {
    id: payload.id,
    login: payload.login,
    name: payload.name || null,
    avatarUrl: payload.avatar_url,
  }
}

export function isAllowedGitHubUser(env: AppEnv, login: string): boolean {
  return env.githubAdminUsers.includes(login.trim().toLowerCase())
}
