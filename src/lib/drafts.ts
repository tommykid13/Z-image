import {
  CURRENT_SCHEMA_VERSION,
  normalizePromptDb,
  type Category,
  type PromptDb,
  type PromptItem,
} from '../../shared/prompt-schema'

export function nowIso(): string {
  return new Date().toISOString()
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function createPromptDraft(categoryId?: string): PromptItem {
  const timestamp = nowIso()
  return {
    id: `prompt-${shortId()}`,
    title: '',
    content: '',
    categoryId: categoryId || '',
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createCategoryDraft(order: number): Category {
  return {
    id: `category-${shortId()}`,
    name: '',
    order,
  }
}

export function upsertPrompt(data: PromptDb, nextPrompt: PromptItem): PromptDb {
  const exists = data.prompts.some((prompt) => prompt.id === nextPrompt.id)
  const prompts = exists
    ? data.prompts.map((prompt) => (prompt.id === nextPrompt.id ? nextPrompt : prompt))
    : [nextPrompt, ...data.prompts]

  return normalizePromptDb({
    ...data,
    prompts,
  })
}

export function removePrompt(data: PromptDb, promptId: string): PromptDb {
  return normalizePromptDb({
    ...data,
    prompts: data.prompts.filter((prompt) => prompt.id !== promptId),
  })
}

export function upsertCategory(data: PromptDb, nextCategory: Category): PromptDb {
  const exists = data.categories.some((category) => category.id === nextCategory.id)
  const categories = exists
    ? data.categories.map((category) => (category.id === nextCategory.id ? nextCategory : category))
    : [...data.categories, nextCategory]

  return normalizePromptDb({
    ...data,
    categories,
  })
}

export function removeCategory(data: PromptDb, categoryId: string): PromptDb {
  return normalizePromptDb({
    ...data,
    categories: data.categories.filter((category) => category.id !== categoryId),
  })
}

export function createEmptyClientDb(): PromptDb {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories: [],
    prompts: [],
  }
}

export function serializePromptDb(data: PromptDb): string {
  return JSON.stringify(normalizePromptDb(data))
}
