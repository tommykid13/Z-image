export interface AppEnv {
  sessionSecret?: string
  githubOwner?: string
  githubRepo?: string
  githubBranch: string
  githubToken?: string
  githubOAuthClientId?: string
  githubOAuthClientSecret?: string
  githubOAuthRedirectUri?: string
  githubAdminUsers: string[]
  dataPath: string
  uploadDir: string
  maxImageBytes: number
  isProduction: boolean
}

function parseList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function getEnv(): AppEnv {
  return {
    sessionSecret: process.env.SESSION_SECRET,
    githubOwner: process.env.GITHUB_OWNER,
    githubRepo: process.env.GITHUB_REPO,
    githubBranch: process.env.GITHUB_BRANCH || 'main',
    githubToken: process.env.GITHUB_TOKEN,
    githubOAuthClientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    githubOAuthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    githubOAuthRedirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
    githubAdminUsers: parseList(process.env.GITHUB_ADMIN_USERS),
    dataPath: normalizeRepoPath(process.env.DATA_PATH || 'data/prompts.json'),
    uploadDir: normalizeRepoPath(process.env.UPLOAD_DIR || 'public/uploads'),
    maxImageBytes: 2 * 1024 * 1024,
    isProduction: process.env.NODE_ENV === 'production',
  }
}

export function hasAdminAuthConfigured(env: AppEnv): boolean {
  return Boolean(env.sessionSecret && env.githubOAuthClientId && env.githubOAuthClientSecret && env.githubAdminUsers.length)
}

export function hasGitHubWriteConfigured(env: AppEnv): boolean {
  return Boolean(env.githubOwner && env.githubRepo && env.githubBranch && env.githubToken)
}

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

export function getPublicUploadBasePath(env: AppEnv): string {
  const normalized = normalizeRepoPath(env.uploadDir)
  if (normalized.startsWith('public/')) {
    return `/${normalized.slice('public/'.length)}`
  }

  return `/${normalized}`
}

export function buildImagePath(env: AppEnv, fileName: string): string {
  return `${getPublicUploadBasePath(env)}/${fileName}`.replace(/\/+/g, '/')
}

export function buildUploadRepoPath(env: AppEnv, fileName: string): string {
  return `${normalizeRepoPath(env.uploadDir)}/${fileName}`.replace(/\/+/g, '/')
}

export function publicImagePathToRepoPath(env: AppEnv, imagePath: string): string {
  const publicBase = getPublicUploadBasePath(env)
  if (!imagePath.startsWith(publicBase)) {
    throw new Error('图片路径与当前上传目录不匹配')
  }

  const fileName = imagePath.slice(publicBase.length).replace(/^\/+/, '')
  return buildUploadRepoPath(env, fileName)
}
