import { readBinaryFromRepo } from './_lib/data-store'
import { getEnv, publicImagePathToRepoPath } from './_lib/env'
import { getRequestUrl, methodNotAllowed, sendJson, type ApiRequest, type ApiResponse } from './_lib/http'
import { getMimeTypeFromPath } from './_lib/upload'

function isSafePublicImagePath(value: string): boolean {
  return /^\/uploads\/[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp|gif)$/i.test(value)
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const env = getEnv()
  const imagePath = getRequestUrl(req).searchParams.get('path') || ''
  if (!isSafePublicImagePath(imagePath)) {
    sendJson(res, 400, { error: '图片路径非法' })
    return
  }

  try {
    const repoPath = publicImagePathToRepoPath(env, imagePath)
    const file = await readBinaryFromRepo(env, repoPath)
    if (!file) {
      sendJson(res, 404, { error: '图片不存在' })
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', getMimeTypeFromPath(imagePath))
    res.setHeader('Cache-Control', 'no-store')
    res.end(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片读取失败'
    sendJson(res, 500, { error: '图片读取失败', details: message })
  }
}
