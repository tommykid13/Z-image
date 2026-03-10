import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 1

const idSchema = z
  .string()
  .trim()
  .min(1, 'ID 不能为空')
  .max(80, 'ID 过长')
  .regex(/^[a-zA-Z0-9._-]+$/, 'ID 只能包含字母、数字、点、下划线和短横线')

const tagSchema = z.string().trim().min(1, '标签不能为空').max(32, '标签过长')

const isoDatetimeSchema = z.string().datetime({ offset: true, message: '时间必须为 ISO 格式' })

export const categorySchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1, '分类名称不能为空').max(48, '分类名称过长'),
    order: z.number().int('order 必须为整数').min(0, 'order 不能小于 0'),
  })
  .strict()

export const promptSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1, '标题不能为空').max(120, '标题过长'),
    content: z.string().trim().min(1, '内容不能为空').max(20000, '内容过长'),
    categoryId: idSchema,
    tags: z.array(tagSchema).max(20, '标签不能超过 20 个').optional(),
    imagePath: z
      .string()
      .trim()
      .regex(/^\/uploads\/[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp|gif)$/i, '图片路径必须为 /uploads/ 下的图片文件')
      .optional(),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict()

export const promptDbSchema = z
  .object({
    schemaVersion: z.number().int('schemaVersion 必须为整数').positive('schemaVersion 必须大于 0'),
    categories: z.array(categorySchema),
    prompts: z.array(promptSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schemaVersion'],
        message: `当前仅支持 schemaVersion = ${CURRENT_SCHEMA_VERSION}`,
      })
    }

    const categoryIds = new Set<string>()
    for (const [index, category] of value.categories.entries()) {
      if (categoryIds.has(category.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories', index, 'id'],
          message: `分类 ID 重复：${category.id}`,
        })
      }
      categoryIds.add(category.id)
    }

    const promptIds = new Set<string>()
    for (const [index, prompt] of value.prompts.entries()) {
      if (promptIds.has(prompt.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompts', index, 'id'],
          message: `Prompt ID 重复：${prompt.id}`,
        })
      }
      promptIds.add(prompt.id)

      if (!categoryIds.has(prompt.categoryId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompts', index, 'categoryId'],
          message: `Prompt 引用了不存在的分类：${prompt.categoryId}`,
        })
      }
    }
  })

export type Category = z.infer<typeof categorySchema>
export type PromptItem = z.infer<typeof promptSchema>
export type PromptDb = z.infer<typeof promptDbSchema>

export function createEmptyPromptDb(): PromptDb {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories: [],
    prompts: [],
  }
}

export function normalizePromptDb(input: PromptDb): PromptDb {
  const categories = [...input.categories]
    .map((category) => ({
      ...category,
      id: category.id.trim(),
      name: category.name.trim(),
    }))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'zh-CN'))

  const prompts = [...input.prompts]
    .map((prompt) => ({
      ...prompt,
      id: prompt.id.trim(),
      title: prompt.title.trim(),
      content: prompt.content.trim(),
      categoryId: prompt.categoryId.trim(),
      tags: prompt.tags?.map((tag) => tag.trim()).filter(Boolean),
      imagePath: prompt.imagePath?.trim() || undefined,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return {
    schemaVersion: input.schemaVersion,
    categories,
    prompts,
  }
}

export function parsePromptDb(input: unknown): PromptDb {
  return normalizePromptDb(promptDbSchema.parse(input))
}

export function safeParsePromptDb(input: unknown) {
  const result = promptDbSchema.safeParse(input)
  if (!result.success) {
    return result
  }

  return {
    success: true as const,
    data: normalizePromptDb(result.data),
  }
}

export function mergePromptDb(base: PromptDb, incoming: PromptDb): PromptDb {
  const categoryMap = new Map<string, Category>()
  for (const category of base.categories) {
    categoryMap.set(category.id, category)
  }
  for (const category of incoming.categories) {
    categoryMap.set(category.id, category)
  }

  const promptMap = new Map<string, PromptItem>()
  for (const prompt of base.prompts) {
    promptMap.set(prompt.id, prompt)
  }
  for (const prompt of incoming.prompts) {
    promptMap.set(prompt.id, prompt)
  }

  return parsePromptDb({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories: Array.from(categoryMap.values()),
    prompts: Array.from(promptMap.values()),
  })
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('\n')
}
