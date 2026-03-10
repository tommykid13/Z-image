import { getEnv } from '../../_lib/env'
import { getRequestUrl, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../_lib/http'
import {
  clearOAuthStateCookie,
  consumeGitHubOAuthState,
  exchangeGitHubCodeForToken,
  fetchGitHubOAuthUser,
  isAllowedGitHubUser,
  normalizeNextPath,
} from '../../_lib/oauth'
import { setAdminSessionCookie, signAdminSession } from '../../_lib/session'

function redirect(res: ApiResponse, location: string): void {
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', location)
  res.end()
}

function buildErrorRedirect(nextPath: string, reason: string): string {
  const url = new URL(nextPath, 'http://local')
  url.searchParams.delete('admin')
  url.searchParams.set('authError', reason)
  return `${url.pathname}${url.search}`
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const env = getEnv()
  const requestUrl = getRequestUrl(req)
  const fallbackNextPath = normalizeNextPath(requestUrl.searchParams.get('next'))
  const error = requestUrl.searchParams.get('error')
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')

  if (error) {
    clearOAuthStateCookie(res, env)
    redirect(res, buildErrorRedirect(fallbackNextPath, error))
    return
  }

  if (!code || !state) {
    clearOAuthStateCookie(res, env)
    redirect(res, buildErrorRedirect(fallbackNextPath, 'github_callback_invalid'))
    return
  }

  try {
    const statePayload = consumeGitHubOAuthState(req, env, state)
    const accessToken = await exchangeGitHubCodeForToken({
      clientId: env.githubOAuthClientId || '',
      clientSecret: env.githubOAuthClientSecret || '',
      code,
      redirectUri: statePayload.redirectUri,
      codeVerifier: statePayload.codeVerifier,
    })

    const user = await fetchGitHubOAuthUser(accessToken)
    if (!isAllowedGitHubUser(env, user.login)) {
      clearOAuthStateCookie(res, env)
      redirect(res, buildErrorRedirect(statePayload.nextPath, 'github_not_allowed'))
      return
    }

    clearOAuthStateCookie(res, env)
    setAdminSessionCookie(
      res,
      signAdminSession(env, {
        githubId: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      }),
      env,
    )

    redirect(res, statePayload.nextPath)
  } catch (callbackError) {
    clearOAuthStateCookie(res, env)
    redirect(res, buildErrorRedirect(fallbackNextPath, 'github_callback_failed'))
    console.error('[oauth-callback]', callbackError)
  }
}
