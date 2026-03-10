import type { PromptItem } from '../../shared/prompt-schema'
import { formatDateTime } from '../lib/format'
import { PromptImage } from './PromptImage'

interface PromptCardProps {
  prompt: PromptItem
  categoryName: string
  active: boolean
  onSelect: () => void
  onCopy: () => void
}

export function PromptCard({ prompt, categoryName, active, onSelect, onCopy }: PromptCardProps) {
  return (
    <article className={`prompt-card ${active ? 'is-active' : ''}`.trim()}>
      <button className="prompt-card__body" type="button" onClick={onSelect}>
        <PromptImage imagePath={prompt.imagePath} alt={prompt.title} className="prompt-card__image" label={categoryName} />
        <div className="prompt-card__meta">
          <p className="eyebrow">{categoryName}</p>
          <h3>{prompt.title}</h3>
          <p className="prompt-card__excerpt">{prompt.content}</p>
        </div>
      </button>
      <div className="prompt-card__footer">
        <span>{formatDateTime(prompt.updatedAt)}</span>
        <button className="ghost-button" type="button" onClick={onCopy}>
          复制
        </button>
      </div>
    </article>
  )
}
