# Entity Operations

## Core Concepts

- `client.entity<TRecord, TCreate, TUpdate>(entityName)` creates a typed entity client.
- `defineEntities({ ... })` groups entity clients.
- `withEntities(client, entities)` merges them onto the composed client as `howone.entities.*`.
- All entity calls are **plain async functions** — no hooks, no subscriptions.

---

## Type Definitions

### EntityRecord (base type)

```ts
type EntityRecord = {
  id: string
  createdDate?: string
  updatedDate?: string
  createdById?: string  // backend owner id from created_by_id
  schemaVersionId?: string
  schemaVersionNumber?: number
  isSample?: boolean
  [key: string]: unknown   // index signature — important for typing
}
```

### Defining entity types

Always define all three types explicitly. **Do not** use `Omit<EntityRecord & ...>` for create types — the index signature widens the payload.

```ts
import { type EntityRecord } from '@howone/sdk'

// ── Story entity ──────────────────────────────────────────────
export type StoryRecord = EntityRecord & {
  title: string
  content: string
  authorId: string
  status: 'draft' | 'published' | 'archived'
  wordCount: number
  tags: string[]
  coverUrl?: string
}

export type StoryCreate = {
  title: string
  content: string
  authorId: string
  status: 'draft' | 'published' | 'archived'
  wordCount: number
  tags?: string[]
  coverUrl?: string
}

export type StoryUpdate = Partial<StoryCreate>
```

### Binding entities

```ts
import { createClient, defineEntities, withEntities } from '@howone/sdk'

const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})

export const entities = defineEntities({
  Story: client.entity<StoryRecord, StoryCreate, StoryUpdate>('Story'),
  Comment: client.entity<CommentRecord, CommentCreate, CommentUpdate>('Comment'),
})

const howone = withEntities(client, entities)
export default howone
```

---

## EntityClient API

```ts
type EntityClient<TRecord, TCreate, TUpdate> = {
  name: string

  // ── Read ──────────────────────────────────────────────────
  list(options?: ListOptions): Promise<TRecord[]>
  query(options?: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>
  query.mine(options?: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>
  get(id: string): Promise<TRecord | null>
  getOrThrow(id: string): Promise<TRecord>
  aggregate<TResult = unknown>(pipeline: unknown[]): Promise<TResult[]>

  // ── Write ─────────────────────────────────────────────────
  create(data: TCreate): Promise<TRecord>
  update(id: string, data: TUpdate): Promise<TRecord>
  delete(id: string): Promise<DeleteResult>
  bulkCreate(records: TCreate[], options?: BulkCreateOptions): Promise<TRecord[]>
}

type DeleteResult = {
  deleted: boolean
  id: string
  message?: string
  traceId?: string | number
}
```

## PublicEntityClient API

Public entity calls use `/api/entities/public/apps/:appId/...` and do not send auth headers.
Only use them when the entity manifest explicitly allows `access.public.read`,
`access.public.create`, or `access.public.update`.

```ts
type PublicEntityClient<TRecord, TPublicCreate, TPublicUpdate> = {
  name: string
  query(options?: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>
  query.scoped(options: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>
  queryScoped(options: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>
  get(id: string, options?: QueryOptions<TRecord>): Promise<TRecord | null>
  getOrThrow(id: string, options?: QueryOptions<TRecord>): Promise<TRecord>
  create(data: TPublicCreate): Promise<TRecord>
  update(id: string, data: TPublicUpdate): Promise<TRecord>
}
```

---

## CRUD Examples

### Create

```ts
const story = await howone.entities.Story.create({
  title: 'My First Story',
  content: 'Once upon a time...',
  authorId: user.id,
  status: 'draft',
  wordCount: 4,
  tags: ['fantasy'],
})
// story is fully typed as StoryRecord
```

### Read — get by ID

```ts
const story = await howone.entities.Story.get(storyId)
// Returns StoryRecord | null

const story = await howone.entities.Story.getOrThrow(storyId)
// Returns StoryRecord, throws if not found
```

### Update

```ts
const updated = await howone.entities.Story.update(storyId, {
  status: 'published',
  wordCount: 320,
})
```

### Delete

```ts
const result = await howone.entities.Story.delete(storyId)
// result.deleted === true on success
```

---

## Querying

### QueryOptions type

```ts
type QueryOptions<TRecord> = {
  where?: WhereInput<TRecord>   // field filters
  search?: string               // full-text search
  page?: PageInput              // pagination
  orderBy?: OrderByInput<TRecord> // sorting
}

type PageInput = { number?: number; size?: number }
type OrderByInput<TRecord> = Partial<Record<keyof TRecord | string, 'asc' | 'desc'>>
```

### QueryResult type

```ts
type QueryResult<TRecord> = {
  items: TRecord[]
  page: {
    number: number
    size: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  traceId?: string | number
}
```

### Basic query

```ts
const result = await howone.entities.Story.query({
  page: { number: 1, size: 20 },
  orderBy: { createdDate: 'desc' },
})

const { items, page } = result
// items: StoryRecord[]
// page.total, page.hasNext, etc.
```

### Search + filter

```ts
const result = await howone.entities.Story.query({
  search: 'dragon',
  where: { status: 'published' },
  page: { number: 1, size: 10 },
  orderBy: { wordCount: 'desc' },
})
```

### query.mine — current authenticated user's records

`query.mine()` is the preferred way to fetch records owned by the authenticated user.
It requires a valid auth token, then lets the backend derive owner from the JWT. Do not
manually pass `created_by_id`, `created_by_user_id`, `ownerId`, or `puid` in authenticated
queries or writes.

```ts
const myStories = await howone.entities.Story.query.mine({
  page: { number: 1, size: 20 },
  orderBy: { updatedDate: 'desc' },
})
```

For public pages that cannot use the current auth session, switch to `howone.public`.
The public endpoint is controlled by `access.public.allowedFilters` and
`access.public.requiredScopes`:

```ts
const result = await howone.public.entities.Story.query({
  published: true,
  page: { number: 1, size: 20 },
  orderBy: { publishedAt: 'desc' },
})
```

### WhereInput — field operators

```ts
type FieldOperator<T> = {
  eq?: T           // exact match (same as plain value)
  equals?: T       // alias for eq
  ne?: T           // not equal
  not?: T          // not equal alias
  gt?: T           // greater than
  gte?: T          // greater than or equal
  lt?: T           // less than
  lte?: T          // less than or equal
  contains?: string // substring (string fields)
  like?: string     // SQL LIKE pattern
  startsWith?: string
  starts?: string
  endsWith?: string
  ends?: string
  in?: T[]          // value in array
  notIn?: T[]       // value not in array
  null?: boolean    // null / not null
  empty?: boolean   // empty / not empty
  exists?: boolean  // field exists / missing
}

// Examples
const result = await howone.entities.Story.query({
  where: {
    status: 'published',               // plain value = eq
    wordCount: { gte: 100, lte: 5000 },
    title: { contains: 'magic' },
    tags: { in: ['fantasy', 'sci-fi'] },
  },
})
```

### Include relations

`include` accepts a string or string array. All entities support `include: 'user'`.
Entity-specific relation names must come from the manifest `relations` contract.

```ts
const result = await howone.entities.Story.query({
  include: ['user', 'author'],
  page: { number: 1, size: 20 },
})
```

---

## list() — Simple Array Read

Use `list()` only for simple reads that don't need pagination metadata.

```ts
// ListOptions type
type ListOptions = {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  [key: string]: unknown  // pass extra filters as top-level keys
}

const stories = await howone.entities.Story.list({ limit: 50, sort: 'title' })
// Returns StoryRecord[]  (no pagination metadata)
```

---

## Public Reads

Use public reads for public lists and scoped public pages.

```ts
const articles = await howone.public.entities.Article.query({
  published: true,
  category: 'ai',
  page: { number: 1, size: 20 },
  orderBy: { publishedAt: 'desc' },
})
```

For `access.public.read = "scoped"`, pass every required scope:

```ts
const profile = await howone.public.entities.QrProfile.queryScoped({
  ownerId: ownerSharedUserId,
  slug: 'wechat',
  active: true,
  limit: 1,
})
```

Public query fields must be present in `access.public.allowedFilters`, and public sort
fields must be present in `access.public.allowedSorts`. If a public query is rejected,
fix the schema access contract instead of falling back to authenticated APIs.

When generated code has the synced entity definition available, validate public queries before
calling the API:

```ts
import { assertPublicEntityQuery } from '@howone/sdk'
import { articleEntityDefinition } from '@/lib/sdk'

const query = {
  where: { status: 'published' },
  orderBy: { publishedAt: 'desc' },
  page: { number: 1, size: 20 },
}

assertPublicEntityQuery(articleEntityDefinition, query)
const result = await howone.public.entities.Article.query(query)
```

Use `validatePublicEntityQuery()` when the app wants to show its own validation UI instead of
throwing.

---

## Public Writes

Only generate public writes when `access.public.create` / `access.public.update` allows
them. Public create must include `created_by_user_id` unless the schema defines a
different required owner scope.

```ts
await howone.public.entities.ContactMessage.create({
  created_by_user_id: projectUserId,
  name: 'Ada',
  email: 'ada@example.com',
  message: 'Please contact me',
})
```

---

## Payload Contract Utilities

Use these helpers when code maps form state, AI output, or mixed UI state into entity writes.
They prevent the common mistake of sending UI-only, workflow-envelope, ownership, or system fields.

```ts
import { pickEntityPayload, assertEntityPayload } from '@howone/sdk'
import { generationEntityDefinition } from '@/lib/sdk'

const draft = {
  prompt,
  status: 'pending',
  created_by_id: user.id,       // stripped/rejected
  gradientDirection: 'to right', // stripped/rejected unless schema declares it
}

const payload = pickEntityPayload(generationEntityDefinition, draft)
assertEntityPayload(generationEntityDefinition, payload)

await howone.entities.Generation.create(payload)
```

Rules:

- Use `pickEntityPayload()` when transforming broad UI objects into narrow create/update payloads.
- Use `validateEntityPayload()` to collect issues for app-owned validation UI.
- Use `assertEntityPayload()` before writes in generated helper functions.
- For updates, pass `{ partial: true }` to avoid requiring create-time fields.
- These helpers do not replace backend validation; they make generated frontend code fail earlier
  with clearer errors.

```ts
assertEntityPayload(generationEntityDefinition, update, { partial: true })
await howone.entities.Generation.update(id, update)
```

---

## Bulk Create

```ts
const sampleStories = await howone.entities.Story.bulkCreate(
  [
    { title: 'Sample 1', content: 'Content 1', authorId: 'sys', status: 'published', wordCount: 10 },
    { title: 'Sample 2', content: 'Content 2', authorId: 'sys', status: 'published', wordCount: 15 },
  ],
  { sample: true }, // mark as sample data
)
```

---

## Aggregation

```ts
// MongoDB-style aggregation pipeline
const stats = await howone.entities.Story.aggregate<{ _id: string; count: number }>([
  { $match: { status: 'published' } },
  { $group: { _id: '$authorId', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
])
```

---

## React Patterns

React integration provides no hooks — use `useEffect` + `useState` or a library like TanStack Query.

### Simple useEffect pattern

```tsx
import { useEffect, useState } from 'react'
import howone, { type StoryRecord } from '@/lib/sdk'

function StoryList() {
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    howone.entities.Story.query({ page: { number: 1, size: 20 } })
      .then(result => { if (!cancelled) setStories(result.items) })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return (
    <ul>
      {stories.map(s => <li key={s.id}>{s.title}</li>)}
    </ul>
  )
}
```

### TanStack Query pattern

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import howone, { type StoryCreate } from '@/lib/sdk'

function useStories(page = 1) {
  return useQuery({
    queryKey: ['stories', page],
    queryFn: () => howone.entities.Story.query({
      page: { number: page, size: 20 },
      orderBy: { createdDate: 'desc' },
    }),
  })
}

function useCreateStory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: StoryCreate) => howone.entities.Story.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })
}

function useDeleteStory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => howone.entities.Story.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })
}
```

---

## Common Mistakes

| Mistake | Correct Pattern |
|---|---|
| `type StoryCreate = Omit<StoryRecord, 'id' \| 'createdDate'>` | Define `StoryCreate` explicitly with exact fields |
| `client.entity('Story')` without generics | `client.entity<StoryRecord, StoryCreate, StoryUpdate>('Story')` |
| Using `list()` when you need pagination | Use `query()` for paginated UIs |
| Calling `query()` inside render without guarding re-runs | Wrap in `useEffect` with cancellation or use TanStack Query |
| Sending form/workflow object directly to `create()` | Use `pickEntityPayload()` and `assertEntityPayload()` |
| Public query with illegal field/sort | Use `assertPublicEntityQuery()` and fix schema guardrails |
