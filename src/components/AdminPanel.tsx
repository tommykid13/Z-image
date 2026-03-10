import { useRef, useState } from 'react'

import type { SaveMode } from '../../shared/contracts'
import type { PromptDb, PromptItem } from '../../shared/prompt-schema'
import { createCategoryDraft, createPromptDraft, removeCategory, removePrompt, upsertCategory, upsertPrompt } from '../lib/drafts'
import { joinTags, splitTags } from '../lib/format'
import { PromptImage } from './PromptImage'

interface AdminPanelProps {
  data: PromptDb
  selectedPromptId: string | null
  persistenceEnabled: boolean
  isSaving: boolean
  isImporting: boolean
  isUploading: boolean
  hasUnsavedChanges: boolean
  onSelectPrompt: (promptId: string | null) => void
  onChangeData: (next: PromptDb) => void
  onSave: () => void
  onReset: () => void
  onExport: () => void
  onImport: (file: File, mode: SaveMode) => Promise<void>
  onUploadImage: (promptId: string, file: File, existingImagePath?: string) => Promise<string>
}

type AdminTab = 'prompts' | 'categories' | 'migration'

function touchPrompt(prompt: PromptItem): PromptItem {
  return {
    ...prompt,
    updatedAt: new Date().toISOString(),
  }
}

export function AdminPanel({
  data,
  selectedPromptId,
  persistenceEnabled,
  isSaving,
  isImporting,
  isUploading,
  hasUnsavedChanges,
  onSelectPrompt,
  onChangeData,
  onSave,
  onReset,
  onExport,
  onImport,
  onUploadImage,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('prompts')
  const [importMode, setImportMode] = useState<SaveMode>('merge')
  const [uploadHint, setUploadHint] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const selectedPrompt = data.prompts.find((prompt) => prompt.id === selectedPromptId) || data.prompts[0] || null

  function updateSelectedPrompt(patch: Partial<PromptItem>) {
    if (!selectedPrompt) {
      return
    }

    onChangeData(
      upsertPrompt(
        data,
        touchPrompt({
          ...selectedPrompt,
          ...patch,
        }),
      ),
    )
  }

  async function handleImport(file: File) {
    await onImport(file, importMode)
    if (importInputRef.current) {
      importInputRef.current.value = ''
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Admin Workspace</p>
          <h2>后台管理</h2>
          <p className="muted-text">
            当前模式：
            {persistenceEnabled ? 'GitHub 持久化已启用，保存会写回仓库。' : '本地临时编辑模式，写回接口已禁用，可继续导出 JSON。'}
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <button className="ghost-button" type="button" onClick={onExport}>
            导出 JSON
          </button>
          <button className="ghost-button" type="button" onClick={onReset} disabled={!hasUnsavedChanges}>
            放弃本地更改
          </button>
          <button className="primary-button" type="button" onClick={onSave} disabled={!hasUnsavedChanges || isSaving || !persistenceEnabled}>
            {isSaving ? '保存中...' : '保存到 GitHub'}
          </button>
        </div>
      </div>

      <div className="admin-tabs">
        {([
          ['prompts', 'Prompt 编辑'],
          ['categories', '分类管理'],
          ['migration', '导入 / 导出'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={`tab-button ${activeTab === tab ? 'is-active' : ''}`.trim()}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'prompts' ? (
        <div className="admin-grid">
          <div className="admin-list">
            <div className="admin-list__header">
              <h3>Prompt 列表</h3>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  const next = createPromptDraft(data.categories[0]?.id)
                  onChangeData(upsertPrompt(data, next))
                  onSelectPrompt(next.id)
                }}
                disabled={!data.categories.length}
              >
                新建 Prompt
              </button>
            </div>
            {!data.categories.length ? <p className="muted-text">请先创建至少一个分类，再新建 Prompt。</p> : null}
            <div className="admin-list__items">
              {data.prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className={`admin-list__item ${selectedPrompt?.id === prompt.id ? 'is-active' : ''}`.trim()}
                  onClick={() => onSelectPrompt(prompt.id)}
                >
                  <strong>{prompt.title || '未命名 Prompt'}</strong>
                  <span>{prompt.id}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-editor">
            {selectedPrompt ? (
              <>
                <div className="field-grid">
                  <label className="field">
                    <span>ID</span>
                    <input value={selectedPrompt.id} disabled />
                  </label>
                  <label className="field">
                    <span>分类</span>
                    <select
                      value={selectedPrompt.categoryId}
                      onChange={(event) => updateSelectedPrompt({ categoryId: event.target.value })}
                    >
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name || category.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>标题</span>
                  <input
                    value={selectedPrompt.title}
                    onChange={(event) => updateSelectedPrompt({ title: event.target.value })}
                    placeholder="例如：高端产品静物光效"
                  />
                </label>

                <label className="field">
                  <span>标签（英文逗号分隔）</span>
                  <input
                    value={joinTags(selectedPrompt.tags)}
                    onChange={(event) => updateSelectedPrompt({ tags: splitTags(event.target.value) })}
                    placeholder="editorial, premium, cinematic"
                  />
                </label>

                <label className="field">
                  <span>内容</span>
                  <textarea
                    value={selectedPrompt.content}
                    rows={10}
                    onChange={(event) => updateSelectedPrompt({ content: event.target.value })}
                    placeholder="输入完整 Prompt 内容"
                  />
                </label>

                <div className="image-uploader">
                  <div>
                    <span className="field__label">预览图</span>
                    <PromptImage
                      imagePath={selectedPrompt.imagePath}
                      alt={selectedPrompt.title || selectedPrompt.id}
                      className="admin-preview-image"
                      label="Preview"
                    />
                    <p className="muted-text">{selectedPrompt.imagePath || '尚未上传预览图'}</p>
                    <p className="muted-text">限制：PNG / JPG / WEBP / GIF，且不超过 2MB。</p>
                  </div>
                  <div className="image-uploader__actions">
                    <label className="ghost-button file-button">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={!persistenceEnabled || isUploading}
                        onChange={async (event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (!file) {
                            return
                          }

                          if (file.size > 2 * 1024 * 1024) {
                            setUploadHint('图片大小不能超过 2MB')
                            return
                          }

                          try {
                            const nextPath = await onUploadImage(selectedPrompt.id, file, selectedPrompt.imagePath)
                            updateSelectedPrompt({ imagePath: nextPath })
                            setUploadHint('图片已写入仓库，别忘了再点击“保存到 GitHub”同步 prompts.json。')
                          } catch {
                            // 具体错误提示由上层统一展示。
                          }
                        }}
                      />
                      {isUploading ? '上传中...' : '上传 / 替换图片'}
                    </label>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => updateSelectedPrompt({ imagePath: undefined })}
                    >
                      清空图片路径
                    </button>
                    {uploadHint ? <p className="muted-text">{uploadHint}</p> : null}
                  </div>
                </div>

                <div className="editor-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`确认删除 Prompt「${selectedPrompt.title || selectedPrompt.id}」吗？`)) {
                        return
                      }

                      onChangeData(removePrompt(data, selectedPrompt.id))
                      onSelectPrompt(data.prompts.find((item) => item.id !== selectedPrompt.id)?.id || null)
                    }}
                  >
                    删除当前 Prompt
                  </button>
                </div>
              </>
            ) : (
              <p className="muted-text">还没有 Prompt，点击左侧按钮开始创建。</p>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'categories' ? (
        <div className="category-manager">
          <div className="admin-list__header">
            <h3>分类列表</h3>
            <button
              className="primary-button"
              type="button"
              onClick={() => onChangeData(upsertCategory(data, createCategoryDraft(data.categories.length)))}
            >
              新建分类
            </button>
          </div>

          <div className="category-manager__items">
            {data.categories.map((category, index) => {
              const inUseCount = data.prompts.filter((prompt) => prompt.categoryId === category.id).length
              return (
                <div key={category.id} className="category-row">
                  <label className="field">
                    <span>ID</span>
                    <input value={category.id} disabled />
                  </label>
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={category.name}
                      onChange={(event) =>
                        onChangeData(
                          upsertCategory(data, {
                            ...category,
                            name: event.target.value,
                          }),
                        )
                      }
                      placeholder="分类名称"
                    />
                  </label>
                  <label className="field field--small">
                    <span>排序</span>
                    <input
                      type="number"
                      value={category.order}
                      onChange={(event) =>
                        onChangeData(
                          upsertCategory(data, {
                            ...category,
                            order: Number(event.target.value || index),
                          }),
                        )
                      }
                    />
                  </label>
                  <div className="category-row__meta">
                    <span>{inUseCount} 条 Prompt</span>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={inUseCount > 0}
                      onClick={() => onChangeData(removeCategory(data, category.id))}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="muted-text">只有当该分类下没有 Prompt 时，才允许删除。</p>
        </div>
      ) : null}

      {activeTab === 'migration' ? (
        <div className="migration-panel">
          <div className="migration-panel__card">
            <h3>导出 JSON</h3>
            <p className="muted-text">导出当前浏览器中的草稿数据，包含 schemaVersion、categories 和 prompts。</p>
            <button className="primary-button" type="button" onClick={onExport}>
              下载当前 JSON
            </button>
          </div>

          <div className="migration-panel__card">
            <h3>导入 JSON</h3>
            <p className="muted-text">支持 merge 与 overwrite 两种模式。导入前会做 schemaVersion 和字段校验。</p>
            <div className="inline-fields">
              <label className="field">
                <span>导入模式</span>
                <select value={importMode} onChange={(event) => setImportMode(event.target.value as SaveMode)}>
                  <option value="merge">merge（按 ID 合并，导入项覆盖同 ID 项）</option>
                  <option value="overwrite">overwrite（完全覆盖）</option>
                </select>
              </label>
              <label className="ghost-button file-button">
                <input ref={importInputRef} type="file" accept=".json,application/json" />
                选择 JSON 文件
              </label>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={isImporting}
              onClick={async () => {
                const file = importInputRef.current?.files?.[0]
                if (!file) {
                  setUploadHint('请先选择一个 JSON 文件')
                  return
                }

                await handleImport(file)
                setUploadHint('JSON 导入完成')
              }}
            >
              {isImporting ? '导入中...' : persistenceEnabled ? '导入并写回 GitHub' : '导入到本地草稿'}
            </button>
            {uploadHint ? <p className="muted-text">{uploadHint}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
