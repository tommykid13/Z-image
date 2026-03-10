import Busboy from 'busboy'

import { type ApiRequest } from './http'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface ParsedUploadFile {
  buffer: Buffer
  mimeType: string
  filename: string
  extension: string
}

export interface ParsedMultipart {
  fields: Record<string, string>
  file: ParsedUploadFile | null
}

export async function parseMultipartImage(req: ApiRequest, maxBytes: number): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    let file: ParsedUploadFile | null = null
    let tooLarge = false

    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: maxBytes,
      },
    })

    bb.on('field', (name, value) => {
      fields[name] = value
    })

    bb.on('file', (_name, stream, info) => {
      const extension = MIME_EXTENSION_MAP[info.mimeType]
      if (!extension) {
        stream.resume()
        reject(new Error('仅支持 PNG、JPG、WEBP、GIF 图片'))
        return
      }

      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('limit', () => {
        tooLarge = true
      })

      stream.on('end', () => {
        if (tooLarge) {
          reject(new Error(`图片大小不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`))
          return
        }

        file = {
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType,
          filename: info.filename,
          extension,
        }
      })
    })

    bb.on('error', (error) => reject(error))
    bb.on('finish', () => resolve({ fields, file }))

    req.pipe(bb)
  })
}

export function getMimeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) {
    return 'image/png'
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp'
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif'
  }

  return 'application/octet-stream'
}
