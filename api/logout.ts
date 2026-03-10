import { getEnv } from './_lib/env'
import { methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from './_lib/http'
import { clearOAuthStateCookie } from './_lib/oauth'
import { clearAdminSessionCookie } from './_lib/session'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const env = getEnv()
  clearOAuthStateCookie(res, env)
  clearAdminSessionCookie(res, env)
  sendJson(res, 200, { ok: true })
}
