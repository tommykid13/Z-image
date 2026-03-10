import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parsePromptDb, type PromptDb } from '../../shared/prompt-schema'
import { hasGitHubWriteConfigured, normalizeRepoPath, type AppEnv } from './env'
import { getGitHubFile, putGitHubFile } from './github'

export interface PromptDbRecord {
  data: PromptDb
  sha: string | null
  source: 'github' | 'local'
}

export function resolveProjectPath(repoPath: string): string {
  return path.join(process.cwd(), ...normalizeRepoPath(repoPath).split('/'))
}

export async function readLocalPromptDb(env: AppEnv): Promise<PromptDbRecord> {
  const content = await readFile(resolveProjectPath(env.dataPath), 'utf8')
  return {
    data: parsePromptDb(JSON.parse(content)),
    sha: null,
    source: 'local',
  }
}

export async function loadPromptDb(env: AppEnv): Promise<PromptDbRecord> {
  if (!hasGitHubWriteConfigured(env)) {
    return readLocalPromptDb(env)
  }

  const file = await getGitHubFile(env, env.dataPath)
  if (!file) {
    throw new Error(`GitHub 仓库中未找到数据文件：${env.dataPath}`)
  }

  return {
    data: parsePromptDb(JSON.parse(Buffer.from(file.contentBase64, 'base64').toString('utf8'))),
    sha: file.sha,
    source: 'github',
  }
}

export async function savePromptDb(env: AppEnv, nextData: PromptDb, sha: string | null): Promise<PromptDbRecord> {
  const normalized = parsePromptDb(nextData)
  const content = `${JSON.stringify(normalized, null, 2)}\n`
  const result = await putGitHubFile(env, {
    repoPath: env.dataPath,
    message: `chore: update prompts data at ${new Date().toISOString()}`,
    contentBase64: Buffer.from(content, 'utf8').toString('base64'),
    sha,
  })

  return {
    data: normalized,
    sha: result.sha || sha,
    source: 'github',
  }
}

export async function readBinaryFromRepo(env: AppEnv, repoPath: string): Promise<Buffer | null> {
  if (!hasGitHubWriteConfigured(env)) {
    try {
      return await readFile(resolveProjectPath(repoPath))
    } catch {
      return null
    }
  }

  const file = await getGitHubFile(env, repoPath)
  if (!file) {
    return null
  }

  return Buffer.from(file.contentBase64, 'base64')
}
