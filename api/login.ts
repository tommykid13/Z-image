import { getEnv, hasAdminAuthConfigured } from './_lib/env'
import { methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from './_lib/http'
import { beginGitHubOAuth } from './_lib/oauth'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const env = getEnv()
  if (!hasAdminAuthConfigured(env)) {
    sendJson(res, 503, {
      error: '管理员认证未配置',
      details: '请设置 SESSION_SECRET、GITHUB_OAUTH_CLIENT_ID、GITHUB_OAUTH_CLIENT_SECRET 和 GITHUB_ADMIN_USERS',
    })
    return
  }

  try {
    const authorizeUrl = beginGitHubOAuth(req, res, env)
    res.statusCode = 302
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Location', authorizeUrl)
    res.end()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub 登录初始化失败'
    sendJson(res, 400, { error: 'GitHub 登录初始化失败', details: message })
  }
}
