import type { UploadImageResponse } from '../shared/contracts'
import { buildImagePath, buildUploadRepoPath, getEnv, hasGitHubWriteConfigured, publicImagePathToRepoPath } from './_lib/env'
import { deleteGitHubFile, getGitHubFile, GithubConflictError, GithubRequestError, putGitHubFile } from './_lib/github'
import { methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from './_lib/http'
import { ensureAdmin } from './_lib/session'
import { parseMultipartImage } from './_lib/upload'

export const config = {
  api: {
    bodyParser: false,
  },
}

function isSafePromptId(promptId: string): boolean {
  return /^[a-zA-Z0-9._-]{1,80}$/.test(promptId)
}

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
      details: '当前处于本地只读模式，图片无法写入仓库。',
    })
    return
  }

  try {
    const { fields, file } = await parseMultipartImage(req, env.maxImageBytes)
    if (!file) {
      sendJson(res, 400, { error: '未检测到图片文件' })
      return
    }

    const promptId = (fields.promptId || '').trim()
    if (!isSafePromptId(promptId)) {
      sendJson(res, 400, {
        error: 'promptId 非法',
        details: '只能包含字母、数字、点、下划线和短横线',
      })
      return
    }

    const fileName = `${promptId}.${file.extension}`
    const imagePath = buildImagePath(env, fileName)
    const repoPath = buildUploadRepoPath(env, fileName)
    const existingTarget = await getGitHubFile(env, repoPath)

    await putGitHubFile(env, {
      repoPath,
      message: `chore: upload preview image for ${promptId}`,
      contentBase64: file.buffer.toString('base64'),
      sha: existingTarget?.sha,
    })

    const existingImagePath = (fields.existingImagePath || '').trim()
    if (existingImagePath && existingImagePath !== imagePath) {
      try {
        const oldRepoPath = publicImagePathToRepoPath(env, existingImagePath)
        const oldFile = await getGitHubFile(env, oldRepoPath)
        if (oldFile) {
          await deleteGitHubFile(env, {
            repoPath: oldRepoPath,
            message: `chore: remove replaced preview image for ${promptId}`,
            sha: oldFile.sha,
          })
        }
      } catch {
        // 旧图清理失败不影响主流程。
      }
    }

    const payload: UploadImageResponse = {
      ok: true,
      imagePath,
    }
    sendJson(res, 200, payload)
  } catch (error) {
    if (error instanceof GithubConflictError) {
      sendJson(res, 409, { error: '图片文件冲突，请重试', details: error.message })
      return
    }

    if (error instanceof GithubRequestError) {
      sendJson(res, error.status, { error: '图片上传失败', details: error.message })
      return
    }

    const message = error instanceof Error ? error.message : '图片上传失败'
    sendJson(res, 400, { error: '图片上传失败', details: message })
  }
}
