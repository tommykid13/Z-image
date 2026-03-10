import type { PromptDb } from './prompt-schema'

export type SaveMode = 'merge' | 'overwrite'
export type AuthProvider = 'github-oauth'

export interface AdminUser {
  login: string
  name?: string | null
  avatarUrl?: string
}

export interface PromptsPayload {
  data: PromptDb
  sha: string | null
  isAdmin: boolean
  writable: boolean
  githubConfigured: boolean
  authConfigured: boolean
  authProvider: AuthProvider
  adminUser: AdminUser | null
  source: 'github' | 'local'
}

export interface ApiErrorPayload {
  error: string
  details?: string
}

export interface SavePromptsRequest {
  data: PromptDb
  sha: string | null
}

export interface SavePromptsResponse {
  ok: true
  data: PromptDb
  sha: string | null
}

export interface ImportPromptsRequest {
  mode: SaveMode
  incoming: PromptDb
  sha: string | null
}

export interface UploadImageResponse {
  ok: true
  imagePath: string
}
