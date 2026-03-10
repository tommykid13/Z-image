import type { PromptsPayload } from '../shared/contracts'
import { getEnv, hasAdminAuthConfigured, hasGitHubWriteConfigured } from './_lib/env'
import { loadPromptDb } from './_lib/data-store'
import { methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from './_lib/http'
import { getAdminSession } from './_lib/session'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const env = getEnv()

  try {
    const record = await loadPromptDb(env)
    const session = getAdminSession(req, env)
    const payload: PromptsPayload = {
      data: record.data,
      sha: record.sha,
      isAdmin: Boolean(session),
      writable: hasGitHubWriteConfigured(env),
      githubConfigured: hasGitHubWriteConfigured(env),
      authConfigured: hasAdminAuthConfigured(env),
      authProvider: 'github-oauth',
      adminUser: session
        ? {
            login: session.login,
            name: session.name,
            avatarUrl: session.avatarUrl,
          }
        : null,
      source: record.source,
    }

    sendJson(res, 200, payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取 prompts 数据失败'
    sendJson(res, 500, {
      error: '读取 prompts 数据失败',
      details: message,
    })
  }
}
