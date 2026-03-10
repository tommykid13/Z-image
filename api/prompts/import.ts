import type { ImportPromptsRequest, SavePromptsResponse } from '../../shared/contracts'
import { mergePromptDb, parsePromptDb } from '../../shared/prompt-schema'
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
      details: '当前处于本地只读模式。导入仍可在浏览器中临时编辑，但无法写回仓库。',
    })
    return
  }

  try {
    const body = await readJsonBody<ImportPromptsRequest>(req)
    if (body.mode !== 'merge' && body.mode !== 'overwrite') {
      sendJson(res, 400, { error: '导入模式错误', details: 'mode 必须为 merge 或 overwrite' })
      return
    }

    const incoming = parsePromptDb(body.incoming)
    const current = await loadPromptDb(env)
    if (body.sha && current.sha && body.sha !== current.sha) {
      sendJson(res, 409, {
        error: '数据版本已变化，请刷新后重试导入',
        details: `当前服务器版本为 ${current.sha}`,
      })
      return
    }

    const nextData = body.mode === 'merge' ? mergePromptDb(current.data, incoming) : incoming
    const saved = await savePromptDb(env, nextData, current.sha)
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
      sendJson(res, error.status, { error: '导入写回失败', details: error.message })
      return
    }

    const message = error instanceof Error ? error.message : '导入失败'
    sendJson(res, 400, { error: '导入失败', details: message })
  }
}
