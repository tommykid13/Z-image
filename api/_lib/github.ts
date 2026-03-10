import { hasGitHubWriteConfigured, normalizeRepoPath, type AppEnv } from './env'

interface GithubContentsFileResponse {
  sha: string
  content: string
  encoding: 'base64'
}

interface PutFileOptions {
  repoPath: string
  message: string
  contentBase64: string
  sha?: string | null
}

interface DeleteFileOptions {
  repoPath: string
  message: string
  sha: string
}

export class GithubRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubRequestError'
    this.status = status
  }
}

export class GithubConflictError extends GithubRequestError {
  constructor(message = 'GitHub 文件已被更新，请刷新后重试') {
    super(message, 409)
    this.name = 'GithubConflictError'
  }
}

function getRepoApiBase(env: AppEnv): string {
  if (!hasGitHubWriteConfigured(env)) {
    throw new GithubRequestError('GitHub 写回未配置', 503)
  }

  return `https://api.github.com/repos/${env.githubOwner}/${env.githubRepo}`
}

function encodeContentsPath(repoPath: string): string {
  return normalizeRepoPath(repoPath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

async function parseGithubError(response: Response): Promise<never> {
  let message = `GitHub API 请求失败（${response.status}）`

  try {
    const payload = (await response.json()) as { message?: string }
    if (payload.message) {
      message = payload.message
    }
  } catch {
    // ignore
  }

  if (response.status === 409 || response.status === 422) {
    throw new GithubConflictError(message)
  }

  throw new GithubRequestError(message, response.status)
}

export async function getGitHubFile(env: AppEnv, repoPath: string): Promise<{ sha: string; contentBase64: string } | null> {
  const url = `${getRepoApiBase(env)}/contents/${encodeContentsPath(repoPath)}?ref=${encodeURIComponent(env.githubBranch)}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'z-image-prompt',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    await parseGithubError(response)
  }

  const payload = (await response.json()) as GithubContentsFileResponse
  return {
    sha: payload.sha,
    contentBase64: payload.content.replace(/\n/g, ''),
  }
}

export async function putGitHubFile(env: AppEnv, options: PutFileOptions): Promise<{ sha: string }> {
  const url = `${getRepoApiBase(env)}/contents/${encodeContentsPath(options.repoPath)}`
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'z-image-prompt',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: options.message,
      content: options.contentBase64,
      branch: env.githubBranch,
      sha: options.sha || undefined,
    }),
  })

  if (!response.ok) {
    await parseGithubError(response)
  }

  const payload = (await response.json()) as { content?: { sha?: string } }
  return {
    sha: payload.content?.sha || '',
  }
}

export async function deleteGitHubFile(env: AppEnv, options: DeleteFileOptions): Promise<void> {
  const url = `${getRepoApiBase(env)}/contents/${encodeContentsPath(options.repoPath)}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'z-image-prompt',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: options.message,
      branch: env.githubBranch,
      sha: options.sha,
    }),
  })

  if (response.status === 404) {
    return
  }

  if (!response.ok) {
    await parseGithubError(response)
  }
}
