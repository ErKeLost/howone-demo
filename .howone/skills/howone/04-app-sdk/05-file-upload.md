# File Upload

## Overview

`client.upload` provides three methods for uploading files to the HowOne storage backend:
- `upload.file(file, options?)` — general-purpose single file upload with progress and abort support
- `upload.image(file)` — convenience wrapper for image uploads
- `upload.batch(options)` — upload multiple files with concurrency control

All upload methods are accessed from the `client` (or `howone`) object directly — they are **not** part of entities or AI.

---

## Types

```ts
// ── Input ─────────────────────────────────────────────────────
type UploadableFile = File | Blob | string  // string = URL or base64

// ── Options ───────────────────────────────────────────────────
type UploadOptions = {
  onProgress?: (percent: number) => void  // 0–100
  signal?: AbortSignal                    // for cancellation
  metadata?: Record<string, any>          // custom metadata to attach
}

// ── Single upload result ──────────────────────────────────────
type UploadResponse = {
  url: string           // CDN URL of the uploaded file
  thumbnailUrl?: string // thumbnail URL (for images/videos)
  id?: string           // storage file ID
  size?: number         // file size in bytes
  mimeType?: string     // detected MIME type
}

// ── Batch upload options ──────────────────────────────────────
type BatchUploadOptions = {
  files: (File | Blob)[]
  concurrent?: number                                           // default: 3
  onProgress?: (completed: number, total: number) => void
  onFileComplete?: (result: UploadResponse | Error, index: number) => void
  signal?: AbortSignal
}

// ── Batch upload result ───────────────────────────────────────
type BatchUploadResponse = {
  success: UploadResponse[]
  failed: Array<{ index: number; error: string }>
  total: number
}
```

---

## upload.file — Single File Upload

```ts
import howone from '@/lib/sdk'

// Basic upload
const result = await howone.upload.file(file)
console.log(result.url)        // 'https://cdn.howone.app/...'
console.log(result.size)       // 12345 (bytes)
console.log(result.mimeType)   // 'image/jpeg'

// With progress callback
const result = await howone.upload.file(file, {
  onProgress: (percent) => {
    console.log(`Upload progress: ${percent}%`)
    setProgress(percent)
  },
})

// With cancellation
const controller = new AbortController()
const promise = howone.upload.file(file, {
  signal: controller.signal,
  onProgress: setProgress,
})

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

const result = await promise

// With metadata
const result = await howone.upload.file(file, {
  metadata: {
    entityId: story.id,
    uploadedBy: user.id,
    category: 'cover',
  },
})
```

---

## upload.image — Image Shorthand

```ts
import howone from '@/lib/sdk'

// Accepts File, Blob, or a URL/base64 string
const { url } = await howone.upload.image(imageFile)
console.log(url)  // 'https://cdn.howone.app/images/...'

// Use the URL directly in an img tag or save to an entity
await howone.entities.Story.update(storyId, { coverUrl: url })
```

---

## upload.batch — Multiple Files

```ts
import howone from '@/lib/sdk'

const files: File[] = Array.from(fileInput.files ?? [])

const result = await howone.upload.batch({
  files,
  concurrent: 3,        // upload 3 at a time

  onProgress: (completed, total) => {
    console.log(`${completed} / ${total} files uploaded`)
    setProgress(Math.round((completed / total) * 100))
  },

  onFileComplete: (result, index) => {
    if (result instanceof Error) {
      console.error(`File ${index} failed:`, result.message)
    } else {
      console.log(`File ${index} URL:`, result.url)
    }
  },
})

console.log('Uploaded:', result.success.length)
console.log('Failed:', result.failed.length)

// Collect all URLs
const urls = result.success.map(r => r.url)

// With cancellation
const controller = new AbortController()
const resultPromise = howone.upload.batch({
  files,
  signal: controller.signal,
  onProgress: (c, t) => console.log(c, '/', t),
})
// controller.abort() to cancel
```

---

## React Patterns

### Single image upload component

```tsx
import { useRef, useState } from 'react'
import howone from '@/lib/sdk'

export function ImageUploader({
  onUpload,
}: {
  onUpload: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setProgress(0)
    setError(null)
    abortRef.current = new AbortController()

    try {
      const result = await howone.upload.file(file, {
        signal: abortRef.current.signal,
        onProgress: setProgress,
      })
      onUpload(result.url)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    } finally {
      setUploading(false)
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

### Multi-file upload with gallery preview

```tsx
import { useState } from 'react'
import howone from '@/lib/sdk'

export function MultiFileUploader() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [failedCount, setFailedCount] = useState(0)

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []))
    setUploadedUrls([])
    setFailedCount(0)
  }

  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setProgress({ completed: 0, total: files.length })

    const result = await howone.upload.batch({
      files,
      concurrent: 3,
      onProgress: (completed, total) => setProgress({ completed, total }),
    })

    setUploadedUrls(result.success.map(r => r.url))
    setFailedCount(result.failed.length)
    setUploading(false)
  }

  return (
    <div>
      <input type="file" multiple onChange={handleSelect} disabled={uploading} />
      <button onClick={handleUpload} disabled={uploading || !files.length}>
        {uploading
          ? `Uploading ${progress.completed}/${progress.total}...`
          : `Upload ${files.length} files`}
      </button>
      {failedCount > 0 && <p>{failedCount} files failed to upload</p>}
      <div className="gallery">
        {uploadedUrls.map((url, i) => (
          <img key={i} src={url} alt={`Upload ${i}`} />
        ))}
      </div>
    </div>
  )
}
```

### Upload and save to entity

```tsx
import howone, { type StoryUpdate } from '@/lib/sdk'

async function uploadCoverAndUpdate(storyId: string, coverFile: File) {
  // 1. Upload image
  const { url } = await howone.upload.image(coverFile)

  // 2. Update entity with the uploaded URL
  const updated = await howone.entities.Story.update(storyId, {
    coverUrl: url,
  })

  return updated
}
```

### Upload from AI output (AI-generated image URL → storage)

```tsx
import howone from '@/lib/sdk'

async function saveGeneratedImage(aiImageUrl: string, storyId: string) {
  // Upload by URL (download + re-upload to HowOne storage)
  const { url } = await howone.upload.image(aiImageUrl)

  await howone.entities.Story.update(storyId, { coverUrl: url })
  return url
}
```

---

## Common Mistakes

| Mistake | Correct Pattern |
|---|---|
| Assuming `upload.image` returns the same shape as `upload.file` | `upload.image` returns `{ url: string }` only; `upload.file` returns full `UploadResponse` |
| Not handling partial batch failures | Always check `result.failed.length` and `result.success` separately |
| Leaking upload after component unmount | Store `AbortController` in a ref and abort on cleanup |
| Saving a raw blob URL (`blob://...`) to an entity | Always await the upload first, then save the returned CDN `url` |
