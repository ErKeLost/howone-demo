# Database Schema Design

**Track:** `02-entity-schema/` — platform entity contracts only; skip when the user needs no HowOne persisted data.

Use this reference when designing or changing HowOne backend entity schemas. It condenses the
runtime contract from `docs/dynamic-entity-architecture.zh.md` into instructions an AI agent can
actually apply.

This file answers: **what should the schema be?** For how to apply changes, read
`02-schema-operations.md`. For access/query contract details, read `03-access-models.md` and
`04-query-contracts.md`. For frontend calls, wait for manifest sync, then read
`04-app-sdk/02-entity-operations.md`.

## Mental Model

A HowOne Entity is a versioned app-level database contract. It is not a MongoDB collection exposed
directly and not a loose JSON form.

Design the whole contract:

```ts
type EntityContract = {
  name: string
  type: 'object'
  description?: string
  visibility: 'private' | 'public'
  properties: Record<string, EntityField>
  required?: string[]
  access: {
    authenticated: AuthenticatedAccess
    public: PublicAccess
  }
  indexes?: EntityIndex[]
  relations?: Record<string, EntityRelation>
  presentation?: EntityPresentation
  lifecycle?: EntityLifecycle
  performance?: EntityPerformance
}
```

Each section has a different job:

| Section | Purpose | AI design question |
|---|---|---|
| `properties` | Business fields and primitive validation | What data is persisted? |
| `required` | Create-time required fields | What must exist before first save? |
| `access.authenticated` | Logged-in/private API access | Who can read/write after auth? |
| `access.public` | Anonymous/public API access | Can a public page read or write it? |
| `indexes` | Query performance and uniqueness | What lists/details will be queried often? |
| `relations` | Valid include names | What can be joined/expanded? |
| `presentation` | Admin/generator hints | What fields identify the record in UI? |
| `lifecycle` | Audit/delete policy hints | Is this append-only, soft-deletable, audited? |
| `performance` | Runtime/admin pagination/sort hints | What limits and sorts are safe? |

## Storage Reality

HowOne uses shared runtime collections:

| Collection | Meaning |
|---|---|
| `entityshares` | Current active entity definitions. |
| `entitydatashares` | Real business records. |
| `entityschemaversions` | Historical schema snapshots. |
| `entityschemastates` | Current schema version pointer per app. |
| `usershares` | App user mapping used for ownership. |

Schema restore changes definitions only. It does **not** roll back existing business records.

Every data row may carry:

```ts
{
  id: string
  created_date: string
  updated_date: string
  created_by_id: string
  schema_version_id?: string
  schema_version_number?: number
  is_sample?: boolean
  ...businessFields
}
```

Do not create business fields that collide with system fields.

## Field Design

### Naming

Entity and field names must match:

```text
^[a-zA-Z_][a-zA-Z0-9_]*$
```

Conventions:

- Entity names: PascalCase, singular, domain noun: `Todo`, `Article`, `QrProfile`.
- Field names: camelCase: `qrImageUrl`, `publishedAt`, `moodScore`.
- Avoid ambiguous names like `data`, `info`, `value`, `result` unless the product really stores opaque blobs.

Forbidden business field names:

```text
id
_id
created_date
updated_date
created_by_id
createdById
ownerId
is_sample
schema_version_id
schema_version_number
```

`created_by_user_id` is special: use it only when a public write/share flow explicitly needs a
project-user identifier. Do not use it as the owner field for normal authenticated private data;
the backend derives owner from JWT.

### Supported Types

```text
string
number
boolean
date
array
object
integer
null
```

Nullable:

```json
{ "type": ["string", "null"], "default": null }
```

Backend runtime currently enforces:

- unknown field rejection;
- create required fields;
- basic primitive type checks;
- non-null required fields unless the type includes `null`;
- defaults and `autoGenerate`.

Do not assume full JSON Schema enforcement for every nested constraint. Use Zod/frontend validation
for stronger UX validation:

- `enum`
- `minimum` / `maximum`
- `minLength` / `maxLength`
- `pattern`
- nested `items` / `properties`

### Defaults and Generated Fields

Use `default` when a field has an obvious value at creation:

```json
{ "completed": { "type": "boolean", "default": false } }
```

Use nullable defaults for optional dates:

```json
{ "publishedAt": { "type": ["date", "null"], "default": null } }
```

Use server generation for public IDs:

```json
{
  "publicId": {
    "type": "string",
    "autoGenerate": { "strategy": "uuid" }
  }
}
```

Current `autoGenerate.strategy` support:

```text
uuid
```

AI rule: Create input may omit fields with `default` or `autoGenerate`; response types should include
them as present/possible.

## Access Design

Always write both `authenticated` and `public`. Do not rely on `visibility` defaults for new schema.

Authenticated channel:

```text
/api/entities/apps/:appId/data/:entityName
```

Public channel:

```text
/api/entities/public/apps/:appId/data/:entityName
```

These channels are independent.

### Authenticated Access

Each action accepts `own`, `all`, or `none`:

```json
"authenticated": {
  "read": "own",
  "create": "own",
  "update": "own",
  "delete": "own"
}
```

| Value | Meaning |
|---|---|
| `own` | Backend scopes to current `usershares._id`; create assigns current owner. |
| `all` | Logged-in users can access all records for that operation. |
| `none` | Operation forbidden. |

Rules:

- For private user data, use all `own`.
- For authenticated shared dashboards/CMS, use `read: "all"` and be conservative on update/delete.
- Do not pass owner fields in authenticated payloads or filters. Backend derives owner from auth.
- Authenticated own lists must use the authenticated channel so the backend can derive ownership.

### Public Access

Public read values:

| Value | Use for |
|---|---|
| `none` | Not visible without login. |
| `list` | Public feeds/catalogs/lists. |
| `scoped` | Public share/detail pages that require scope keys. |

Public write values:

| Value | Use for |
|---|---|
| `none` | No anonymous write. |
| `scoped` | Anonymous write only with required scope values. |
| `any` | Fully public write; use rarely. |

Guardrail fields:

```json
"public": {
  "read": "scoped",
  "create": "none",
  "update": "none",
  "requiredScopes": ["ownerId", "slug"],
  "allowedFilters": ["slug", "active"],
  "allowedSorts": ["updatedDate"],
  "defaultLimit": 1,
  "maxLimit": 10
}
```

Rules:

- `scoped` requires every `requiredScopes` value in query/body.
- `list` must define `allowedFilters`, `allowedSorts`, `defaultLimit`, and `maxLimit`.
- Public create requires a clear ownership/scoping story. If it needs `created_by_user_id`, document where that value comes from.
- Never expose broad public write unless the product explicitly needs anonymous submissions.

## Standard Patterns

### A. User Private Data

Use for todos, notes, journals, saved generations, personal settings.

```json
{
  "name": "Todo",
  "type": "object",
  "visibility": "private",
  "properties": {
    "text": { "type": "string" },
    "completed": { "type": "boolean", "default": false }
  },
  "required": ["text"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  },
  "indexes": [
    {
      "name": "owner_completed_updated",
      "scope": "owner",
      "fields": ["completed", "updatedDate"],
      "order": { "updatedDate": "desc" }
    }
  ],
  "performance": {
    "defaultLimit": 50,
    "maxLimit": 100,
    "allowedSorts": ["createdDate", "updatedDate"]
  },
  "presentation": {
    "titleField": "text",
    "defaultSort": { "field": "updatedDate", "order": "desc" },
    "listFields": ["text", "completed", "updatedDate"]
  }
}
```

App implementation handoff: use the SDK entity operations reference after manifest sync.

### B. Public Read-Only Catalog

Use for articles, templates, listings, published galleries.

```json
{
  "name": "Article",
  "type": "object",
  "visibility": "public",
  "properties": {
    "title": { "type": "string" },
    "slug": { "type": "string" },
    "status": { "type": "string", "enum": ["draft", "published"], "default": "draft" },
    "publishedAt": { "type": ["date", "null"], "default": null }
  },
  "required": ["title", "slug"],
  "access": {
    "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
    "public": {
      "read": "list",
      "create": "none",
      "update": "none",
      "delete": "none",
      "allowedFilters": ["slug", "status"],
      "allowedSorts": ["publishedAt", "updatedDate"],
      "defaultLimit": 20,
      "maxLimit": 100
    }
  },
  "indexes": [
    { "name": "slug_unique", "scope": "global", "fields": ["slug"], "unique": true },
    {
      "name": "status_published",
      "scope": "global",
      "fields": ["status", "publishedAt"],
      "order": { "publishedAt": "desc" }
    }
  ]
}
```

App implementation handoff: public list calls are generated from `access.public.allowedFilters`,
`allowedSorts`, and pagination limits after manifest sync.

### C. Public Scoped Share Page

Use for QR profile, public invoice, public resume, shared report.

```json
{
  "name": "QrProfile",
  "type": "object",
  "visibility": "public",
  "properties": {
    "slug": { "type": "string" },
    "title": { "type": "string" },
    "qrImageUrl": { "type": "string" },
    "active": { "type": "boolean", "default": true }
  },
  "required": ["slug", "title", "qrImageUrl"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": {
      "read": "scoped",
      "create": "none",
      "update": "none",
      "delete": "none",
      "requiredScopes": ["ownerId", "slug"],
      "allowedFilters": ["slug", "active"],
      "allowedSorts": ["updatedDate"],
      "defaultLimit": 1,
      "maxLimit": 10
    }
  },
  "indexes": [
    { "name": "owner_slug_unique", "scope": "owner", "fields": ["slug"], "unique": true }
  ]
}
```

App implementation handoff: scoped public reads must include every `requiredScopes` value.

### D. Workflow Output History

Use for AI generation/analyze/report flows that need persisted history.

```json
{
  "name": "Generation",
  "type": "object",
  "visibility": "private",
  "properties": {
    "prompt": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "completed", "failed"], "default": "pending" },
    "resultUrl": { "type": ["string", "null"], "default": null },
    "errorMessage": { "type": ["string", "null"], "default": null },
    "completedAt": { "type": ["date", "null"], "default": null }
  },
  "required": ["prompt", "status"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  },
  "indexes": [
    {
      "name": "owner_status_updated",
      "scope": "owner",
      "fields": ["status", "updatedDate"],
      "order": { "updatedDate": "desc" }
    }
  ]
}
```

Rules:

- Persist pending before long-running workflow when product needs history/resume.
- Persist completed output only into fields declared here.
- Persist failed state and error message if history must show failures.
- Do not persist raw workflow envelopes unless schema declares an object field for them.

## Index Design

Every list/detail path should map to an index.

| Query shape | Index recommendation |
|---|---|
| private user list by updated time | `scope: "owner"`, `fields: ["updatedDate"]` |
| private user list filtered by status | `scope: "owner"`, `fields: ["status", "updatedDate"]` |
| owner unique slug | `scope: "owner"`, `fields: ["slug"]`, `unique: true` |
| public slug detail | `scope: "global"`, `fields: ["slug"]`, `unique: true` |
| public feed by status/date | `scope: "global"`, `fields: ["status", "publishedAt"]` |

Index rules:

- Index fields should match real UI queries, not every field.
- Owner-scoped unique means unique per owner, not globally unique.
- Public filters/sorts must also be listed in `access.public.allowedFilters/allowedSorts`.
- Avoid designing public queries that require unbounded scans.

## Relations

Use `relations` only when frontend/admin needs `include`.

```json
"relations": {
  "author": {
    "type": "entity",
    "entity": "Author",
    "localField": "authorId",
    "foreignField": "id",
    "as": "author"
  }
}
```

Rules:

- Keep relation names stable; app code may use them in `include`.
- Do not use relations to hide missing denormalized fields required by list pages.
- Public include should be conservative; ensure related data is safe to expose.

## Presentation and Lifecycle

`presentation` is not API validation. It teaches admin UI, codegen, and agents how to display a record:

```json
"presentation": {
  "titleField": "title",
  "imageField": "coverImageUrl",
  "defaultSort": { "field": "updatedDate", "order": "desc" },
  "listFields": ["title", "status", "updatedDate"]
}
```

`lifecycle` is policy metadata:

```json
"lifecycle": {
  "audit": true,
  "softDelete": false
}
```

Use it to document intent, but do not assume every lifecycle policy is fully enforced unless backend
source confirms it.

## Schema Review Checklist

Before applying a schema:

- Entity name and field names pass naming rules.
- No business field collides with system fields.
- Every required field exists in `properties`.
- Every optional nullable field has a deliberate `null` type/default.
- Defaults exist for fields that should not block create.
- Access has both `authenticated` and `public`.
- Public list/scoped flows have filters, sorts, scopes, and limits.
- Private owned data does not require app code to pass owner fields.
- Indexes match real list/detail queries.
- Presentation tells UI/admin which fields to show.
- Workflow output fields are explicitly declared before persistence.
- Dangerous public write is avoided or explicitly justified.

If any item cannot be answered from requirements, stop and ask for the missing contract instead of
inventing hidden fields or public exposure.
