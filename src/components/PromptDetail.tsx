import type { Category, PromptItem } from '../../shared/prompt-schema'
import { formatDateTime } from '../lib/format'
import { PromptImage } from './PromptImage'

interface PromptDetailProps {
  prompt: PromptItem | null
  category: Category | null
  onCopy: () => void
}

export function PromptDetail({ prompt, category, onCopy }: PromptDetailProps) {
  if (!prompt) {
    return (
      <aside className="detail-panel detail-panel--empty">
        <p className="eyebrow">Prompt Detail</p>
        <h2>选择一条 Prompt</h2>
        <p>从左侧列表中选择一条 Prompt 后，这里会显示完整内容、标签和预览图。</p>
      </aside>
    )
  }

  return (
    <aside className="detail-panel">
      <div className="detail-panel__media">
        <PromptImage imagePath={prompt.imagePath} alt={prompt.title} className="detail-panel__image" label={category?.name} />
      </div>
      <div className="detail-panel__content">
        <p className="eyebrow">{category?.name || '未分类'}</p>
        <h2>{prompt.title}</h2>
        <div className="detail-panel__actions">
          <button className="primary-button" type="button" onClick={onCopy}>
            一键复制
          </button>
          <span>更新时间：{formatDateTime(prompt.updatedAt)}</span>
        </div>
        <pre className="detail-panel__text">{prompt.content}</pre>
        <div className="detail-panel__tags">
          {(prompt.tags?.length ? prompt.tags : ['无标签']).map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
