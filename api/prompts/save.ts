import type { SavePromptsRequest, SavePromptsResponse } from '../../shared/contracts'
import { parsePromptDb } from '../../shared/prompt-schema'
import { loadPromptDb, savePromptDb } from '../_lib/data-store'
import { getEnv, hasGitHubWriteConfigured } from '../_lib/env'
import { GithubConflictError, GithubRequestError } from '../_lib/github'
import { methodNotAllowed, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http'
import { ensureAdmin } from '../_lib/session'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const env = getEnv()
  if (!ensureAdmin(req, res, env)) {
    return
  }

  if (!hasGitHubWriteConfigured(env)) {
    sendJson(res, 503, {
      error: 'GitHub 写回未配置',
      details: '当前处于本地只读模式。请配置 GITHUB_TOKEN 等环境变量后再保存到仓库。',
    })
    return
  }

  try {
    const body = await readJsonBody<SavePromptsRequest>(req)
    const parsed = parsePromptDb(body.data)

    if (body.sha) {
      const current = await loadPromptDb(env)
      if (current.sha && current.sha !== body.sha) {
        sendJson(res, 409, {
          error: '数据版本已变化，请先刷新最新数据后再保存',
          details: `当前服务器版本为 ${current.sha}`,
        })
        return
      }
    }

    const saved = await savePromptDb(env, parsed, body.sha)
    const payload: SavePromptsResponse = {
      ok: true,
      data: saved.data,
      sha: saved.sha,
    }
    sendJson(res, 200, payload)
  } catch (error) {
    if (error instanceof GithubConflictError) {
      sendJson(res, 409, { error: 'GitHub 文件冲突，请刷新后重试', details: error.message })
      return
    }

    if (error instanceof GithubRequestError) {
      sendJson(res, error.status, { error: 'GitHub 写回失败', details: error.message })
      return
    }

    const message = error instanceof Error ? error.message : '保存失败'
    sendJson(res, 400, { error: '保存失败', details: message })
  }
}
