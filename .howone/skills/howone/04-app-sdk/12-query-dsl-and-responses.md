# Entity Query DSL And Responses (App SDK)

Use this reference when implementing list/detail pages, filters, sorting, pagination, or response
normalization for HowOne dynamic entities.

## SDK Query Shape

```ts
await howone.entities.Todo.query({
  where: {
    completed: false,
    priority: { in: ['medium', 'high'] },
    updatedDate: { gte: '2026-01-01T00:00:00.000Z' },
  },
  search: 'invoice',
  page: { number: 1, size: 20 },
  orderBy: { updatedDate: 'desc' },
  include: ['owner'],
  exactCount: true,
})
```

Private owner-scoped list:

```ts
await howone.entities.Todo.query.mine({
  page: { number: 1, size: 50 },
  orderBy: { updatedDate: 'desc' },
})
```

Public list:

```ts
await howone.public.entities.Article.query({
  where: { status: 'published' },
  orderBy: { publishedAt: 'desc' },
  page: { number: 1, size: 20 },
})
```

Public scoped:

```ts
await howone.public.entities.QrProfile.queryScoped({
  where: { ownerId, slug, active: true },
  page: { number: 1, size: 1 },
})
```

## Operators

Supported field operators:

```ts
type FieldOperator<T> = {
  eq?: T
  equals?: T
  ne?: T
  not?: T
  gt?: T
  gte?: T
  lt?: T
  lte?: T
  contains?: string
  like?: string
  startsWith?: string
  starts?: string
  endsWith?: string
  ends?: string
  in?: T[]
  notIn?: T[]
  null?: boolean
  empty?: boolean
  exists?: boolean
}
```

Examples:

```ts
where: { status: 'published' }
where: { status: { eq: 'published' } }
where: { score: { gte: 80, lt: 100 } }
where: { category: { in: ['news', 'guide'] } }
where: { title: { contains: 'AI' } }
where: { deletedAt: { null: true } }
```

## Pagination

Use SDK page object:

```ts
page: { number: 1, size: 20 }
```

Response:

```ts
type QueryResult<T> = {
  items: T[]
  page: {
    number: number
    size: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  traceId?: string | number
  raw?: unknown
}
```

Always render from a normalized array:

```ts
const result = await howone.entities.Todo.query.mine(...)
const items = Array.isArray(result.items) ? result.items : []
```

## Sorting

SDK uses:

```ts
orderBy: { updatedDate: 'desc' }
```

Rules:

- Public sort fields must be in `access.public.allowedSorts`.
- Private sort fields should be in `performance.allowedSorts` and covered by indexes.
- Prefer `updatedDate` for recently changed lists and `createdDate` for creation history.
- Do not expose arbitrary public sort fields.

## Include / Relations

Use `include` only for relation names declared in schema `relations`.

```ts
await howone.entities.Article.query({
  include: ['author'],
})
```

Rules:

- Do not invent include names.
- Public includes must be safe for anonymous exposure.
- If a list needs a small display field frequently, consider denormalizing it instead of requiring include on every row.

## Detail Reads

Authenticated:

```ts
const item = await howone.entities.Todo.get(id)
const item = await howone.entities.Todo.getOrThrow(id)
```

Public:

```ts
const item = await howone.public.entities.Article.get(id)
```

For public scoped detail, prefer `queryScoped` when the route naturally has scope fields like
`ownerId + slug`.

## Response Field Names

SDK defaults to `caseStyle: 'camel'`, so responses are normalized toward camelCase where supported.
Still know the backend system field meanings:

| Backend concept | Common SDK field |
|---|---|
| record id | `id` |
| created date | `createdDate` or `created_date` depending case style |
| updated date | `updatedDate` or `updated_date` |
| owner | `createdById` or `created_by_id` |
| schema version id | `schemaVersionId` or `schema_version_id` |
| schema version number | `schemaVersionNumber` or `schema_version_number` |

Do not use `_id` in app code unless inspecting raw backend payloads.

## Public Guardrails

Before writing public query code, check schema:

```json
"public": {
  "read": "list",
  "allowedFilters": ["status", "slug"],
  "allowedSorts": ["publishedAt"],
  "defaultLimit": 20,
  "maxLimit": 100
}
```

Then only use allowed filters and sorts:

```ts
// OK
where: { status: 'published' }
orderBy: { publishedAt: 'desc' }

// Not OK unless listed in access.public
where: { internalReviewState: 'approved' }
orderBy: { revenue: 'desc' }
```

## Search

Use `search` for broad text search only when the backend/schema supports the desired behavior:

```ts
await howone.public.entities.Article.query({
  search: query,
  where: { status: 'published' },
})
```

Do not use `search` as a substitute for required public scopes.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Rendering `res.data.data` from SDK query | SDK returns `QueryResult.items`; render `result.items`. |
| Using `_id` as record id | Use `id`. |
| Public query with unlisted filter | Add to `allowedFilters` or remove it. |
| Public query with unlisted sort | Add to `allowedSorts` or change sorting. |
| Passing owner filters in authenticated `own` queries | Use `query.mine()` and omit owner fields. |
| Using include without schema relation | Add relation first or remove include. |
| No pagination on list pages | Always pass `page` and respect `maxLimit`. |
