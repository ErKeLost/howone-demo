# Raw HTTP

## When to Use

Use `client.raw` when you need to call a custom backend endpoint that is **not** covered by `client.entities` or `client.ai`. The raw client is an Axios-based HTTP client that automatically attaches the HowOne auth token and project ID headers.

**Do not use `client.raw` to re-implement entity operations or AI workflows** — use the typed SDK methods instead.

---

## The RawHttpClient Interface

```ts
type RawHttpClient = {
  instance: AxiosInstance

  // All methods return Promise<AxiosResponse>
  request(config: RequestConfig): Promise<AxiosResponse>
  get(config: RequestConfig): Promise<AxiosResponse>
  post(config: RequestConfig): Promise<AxiosResponse>
  put(config: RequestConfig): Promise<AxiosResponse>
  patch(config: RequestConfig): Promise<AxiosResponse>
  delete(config: RequestConfig): Promise<AxiosResponse>

  // Cancel an in-flight request by URL
  cancelRequest(url: string): void

  // Cancel all in-flight requests
  cancelAllRequests(): void
}
```

### RequestConfig

`RequestConfig` extends `AxiosRequestConfig` with optional interceptors:

```ts
type RequestConfig<T = AxiosResponse> = AxiosRequestConfig & {
  interceptors?: {
    requestInterceptor?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
    requestInterceptorCatch?: (error: any) => any
    responseInterceptor?: (res: T) => T
    responseInterceptorCatch?: (error: any) => any
  }
  showLoading?: boolean
}
```

---

## Basic Usage

```ts
import howone from '@/lib/sdk'

// GET
const response = await howone.raw.get({
  url: '/api/custom/stats',
})
const data = response.data  // untyped AxiosResponse.data

// POST with body
const response = await howone.raw.post({
  url: '/api/custom/send-notification',
  data: {
    userId: '123',
    message: 'Hello!',
  },
})

// PUT
const response = await howone.raw.put({
  url: `/api/custom/profile/${userId}`,
  data: { displayName: 'Alice' },
})

// PATCH
const response = await howone.raw.patch({
  url: `/api/custom/settings`,
  data: { theme: 'dark' },
})

// DELETE
const response = await howone.raw.delete({
  url: `/api/custom/sessions/${sessionId}`,
})
```

---

## Typed Responses

Wrap with generics for type safety:

```ts
type StatsResponse = {
  totalUsers: number
  activeToday: number
  storageUsed: number
}

const response = await howone.raw.get<StatsResponse>({
  url: '/api/custom/stats',
})

const stats = response.data  // typed as StatsResponse
```

---

## Query Parameters

```ts
// Pass query params via the `params` field (Axios serializes them automatically)
const response = await howone.raw.get({
  url: '/api/custom/search',
  params: {
    q: 'dragons',
    page: 1,
    limit: 20,
    sort: 'createdAt',
    order: 'desc',
  },
})
// Calls: GET /api/custom/search?q=dragons&page=1&limit=20&sort=createdAt&order=desc
```

---

## Custom Headers

```ts
const response = await howone.raw.post({
  url: '/api/custom/webhook',
  data: payload,
  headers: {
    'X-Webhook-Secret': import.meta.env.VITE_WEBHOOK_SECRET,
    'X-Request-Source': 'app',
  },
})
```

---

## Request Cancellation

```ts
// Cancel a specific request by URL
howone.raw.cancelRequest('/api/custom/long-running')

// Cancel all in-flight requests (e.g. on page unmount)
howone.raw.cancelAllRequests()

// Pattern: cancel on component unmount
import { useEffect } from 'react'
import howone from '@/lib/sdk'

function DataComponent() {
  useEffect(() => {
    howone.raw.get({ url: '/api/custom/data' })
      .then(res => setData(res.data))

    return () => {
      howone.raw.cancelRequest('/api/custom/data')
    }
  }, [])
}
```

---

## Per-Request Interceptors

For one-off request/response transforms without modifying the global client:

```ts
const response = await howone.raw.post({
  url: '/api/custom/transform',
  data: payload,
  interceptors: {
    requestInterceptor: (config) => {
      // Modify request config (e.g. add timestamp)
      config.headers['X-Timestamp'] = Date.now().toString()
      return config
    },
    responseInterceptor: (res) => {
      // Log response time or transform data
      console.log('Response status:', res.status)
      return res
    },
    responseInterceptorCatch: (error) => {
      // Handle specific error codes
      if (error.response?.status === 503) {
        console.error('Service temporarily unavailable')
      }
      return Promise.reject(error)
    },
  },
})
```

---

## Direct Axios Instance Access

For maximum control (multipart forms, streaming responses, etc.):

```ts
const instance = howone.raw.instance  // Axios instance

// Multipart form data
const formData = new FormData()
formData.append('report', file)
formData.append('meta', JSON.stringify({ type: 'monthly' }))

const response = await instance.post('/api/custom/reports', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (e) => {
    const percent = Math.round((e.loaded * 100) / (e.total ?? 1))
    setProgress(percent)
  },
})
```

---

## React Pattern: Data Fetching with Raw HTTP

```tsx
import { useEffect, useState } from 'react'
import howone from '@/lib/sdk'

type AnalyticsData = {
  views: number
  clicks: number
  conversions: number
  period: string
}

function Analytics({ projectId }: { projectId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    howone.raw.get<AnalyticsData>({
      url: '/api/custom/analytics',
      params: { projectId, period: '30d' },
    })
      .then(res => { if (!cancelled) setData(res.data) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      howone.raw.cancelRequest('/api/custom/analytics')
    }
  }, [projectId])

  if (loading) return <div>Loading analytics...</div>
  if (error) return <div>Error: {error}</div>
  if (!data) return null

  return (
    <div>
      <p>Views: {data.views}</p>
      <p>Clicks: {data.clicks}</p>
      <p>Conversions: {data.conversions}</p>
    </div>
  )
}
```

---

## client.raw vs client.entities

| Use Case | Recommended API |
|---|---|
| CRUD on a HowOne entity | `howone.entities.<Entity>.*` |
| Querying with pagination/filter/sort | `howone.entities.<Entity>.query()` |
| Running an AI workflow | `howone.ai.<action>.run()` |
| Calling a custom backend route | `howone.raw.get/post/...` |
| Sending webhooks or notifications | `howone.raw.post()` |
| Fetching analytics or aggregated data not in entities | `howone.raw.get()` |
| Uploading files | `howone.upload.*` |

---

## Common Mistakes

| Mistake | Correct Pattern |
|---|---|
| `howone.raw.get({ url: '/entities/Story' })` to read entities | Use `howone.entities.Story.query()` |
| Not handling Axios errors (`.response.status`) | Wrap in try/catch and check `error.response?.status` |
| Calling `cancelAllRequests()` too broadly | Use `cancelRequest(url)` for surgical cancellation |
| Forgetting that `response.data` is untyped by default | Pass the type parameter: `howone.raw.get<MyType>(...)` |
