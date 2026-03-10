import { useState } from 'react'

interface PromptImageProps {
  imagePath?: string
  alt: string
  className?: string
  label?: string
}

export function PromptImage({ imagePath, alt, className, label }: PromptImageProps) {
  const [failedStaticPath, setFailedStaticPath] = useState<string | null>(null)

  if (!imagePath) {
    return (
      <div className={`image-placeholder ${className || ''}`.trim()}>
        <span>{label || 'No Preview'}</span>
      </div>
    )
  }

  const useFallback = failedStaticPath === imagePath
  const src = useFallback ? `/api/image?path=${encodeURIComponent(imagePath)}` : imagePath

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (!useFallback) {
          setFailedStaticPath(imagePath)
        }
      }}
    />
  )
}
