import type {
  ImportPromptsRequest,
  PromptsPayload,
  SavePromptsRequest,
  SavePromptsResponse,
  UploadImageResponse,
} from '../../shared/contracts'

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
  })

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as { error?: string; details?: string }) : null

  if (!response.ok) {
    const message = payload?.details || payload?.error || `请求失败（${response.status}）`
    throw new Error(message)
  }

  return payload as T
}

export function fetchPrompts(): Promise<PromptsPayload> {
  return requestJson<PromptsPayload>('/api/prompts')
}

export function beginGitHubLogin(nextPath = '/?admin=1'): void {
  window.location.assign(`/api/login?next=${encodeURIComponent(nextPath)}`)
}

export function logout(): Promise<void> {
  return requestJson('/api/logout', {
    method: 'POST',
  }).then(() => undefined)
}

export function savePrompts(data: SavePromptsRequest): Promise<SavePromptsResponse> {
  return requestJson<SavePromptsResponse>('/api/prompts/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

export function importPrompts(body: ImportPromptsRequest): Promise<SavePromptsResponse> {
  return requestJson<SavePromptsResponse>('/api/prompts/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function uploadImage(promptId: string, file: File, existingImagePath?: string): Promise<UploadImageResponse> {
  const formData = new FormData()
  formData.set('promptId', promptId)
  if (existingImagePath) {
    formData.set('existingImagePath', existingImagePath)
  }
  formData.set('image', file)

  return requestJson<UploadImageResponse>('/api/upload-image', {
    method: 'POST',
    body: formData,
  })
}
