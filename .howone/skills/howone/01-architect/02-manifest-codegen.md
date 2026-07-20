# Manifest Codegen

## Overview

HowOne apps are driven by two backend-synced manifests:

| File | Contents | Drives |
|---|---|---|
| `.howone/database/manifest.json` | Entity names, fields, types | Entity type definitions + `client.entity<...>` bindings |
| `.howone/ai/manifest.json` | AI action IDs, input/output JSON schemas | zod schemas + `defineAiAction` bindings |

**The coding agent should always generate `src/lib/sdk.ts` from these manifest files, not from memory or assumptions.**

Sync tools (`sync_schema_artifacts`, `sync_ai_artifacts`) write the manifests. The coding agent reads the manifests and writes `src/lib/sdk.ts`.

For AI capabilities, external workflow create/update is submitted by `external-ai-capability` from
the synced manifest. Do not duplicate AI schemas in app code beyond generated zod/type bindings.
For workflow edits, `external-ai-capability` may rotate the manifest `workflowId`; always re-read
`.howone/ai/manifest.json` after the tool returns before updating `src/lib/sdk.ts`.

---

## Reading `.howone/database/manifest.json`

### Example manifest

```json
{
  "version": "1",
  "entities": [
    {
      "name": "Story",
      "fields": [
        { "name": "title", "type": "string", "required": true },
        { "name": "content", "type": "text", "required": true },
        { "name": "authorId", "type": "string", "required": true },
        { "name": "status", "type": "string", "required": true, "enum": ["draft", "published", "archived"] },
        { "name": "wordCount", "type": "integer", "required": true },
        { "name": "tags", "type": "array", "items": "string", "required": false },
        { "name": "coverUrl", "type": "string", "required": false }
      ]
    },
    {
      "name": "Comment",
      "fields": [
        { "name": "storyId", "type": "string", "required": true },
        { "name": "authorId", "type": "string", "required": true },
        { "name": "body", "type": "text", "required": true },
        { "name": "likes", "type": "integer", "required": false }
      ]
    }
  ]
}
```

### Field type → TypeScript type mapping

| Manifest type | TypeScript type |
|---|---|
| `string` | `string` |
| `text` | `string` |
| `integer` | `number` |
| `number` / `float` | `number` |
| `boolean` | `boolean` |
| `date` / `datetime` | `string` (ISO 8601) |
| `array` (items: string) | `string[]` |
| `array` (items: object) | `Record<string, unknown>[]` or inline type |
| `object` | `Record<string, unknown>` |
| `enum` | `'value1' \| 'value2' \| ...` |
| `["string", "null"]` | `string \| null` |

- Fields in `required: true` are non-optional in `Record` types.
- In `Create` types, required fields are required only when they do not have `default` or `autoGenerate`.
- Fields with `default`, `defaultValue`, or `autoGenerate` are optional in `Create`.
- Nullable fields include `null`.
- System response fields are never generated into `Create` or `Update`.

### Access-aware generated helpers

Use the manifest `access` block to decide which namespace UI code should call:

```ts
export type ArticlePublicQuery = {
  published?: boolean
  category?: string
  slug?: string
  page?: { number?: number; size?: number }
  orderBy?: { publishedAt?: 'asc' | 'desc'; updatedDate?: 'asc' | 'desc' }
}

const publicArticles = await howone.public.entities.Article.query({
  published: true,
  orderBy: { publishedAt: 'desc' },
})
```

Rules:

- `access.authenticated.*` drives `howone.entities.*`.
- `access.public.read = "list"` allows `howone.public.entities.Entity.query`.
- `access.public.read = "scoped"` requires `queryScoped` / `query.scoped` and all `requiredScopes`.
- Public query types must include only `allowedFilters`, `allowedSorts`, `page`, `limit`, `search`, `include`, and `exactCount`.
- Public create/update types should only be emitted when `access.public.create/update` is not `"none"`.
- Public create must include `created_by_user_id` when the schema requires public owner assignment.

### Generated TypeScript from the example manifest

```ts
import { type EntityRecord } from '@howone/sdk'

// ── Story ─────────────────────────────────────────────────────
export type StoryRecord = EntityRecord & {
  title: string
  content: string
  authorId: string
  status: 'draft' | 'published' | 'archived'
  wordCount: number
  tags?: string[]
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

// ── Comment ───────────────────────────────────────────────────
export type CommentRecord = EntityRecord & {
  storyId: string
  authorId: string
  body: string
  likes?: number
}

export type CommentCreate = {
  storyId: string
  authorId: string
  body: string
  likes?: number
}

export type CommentUpdate = Partial<CommentCreate>
```

---

## Reading `.howone/ai/manifest.json`

### Example manifest

```json
{
  "version": "1",
  "actions": [
    {
      "id": "generateStory",
      "name": "Generate Story",
      "workflowId": "d69ab648-2c00-4d94-928e-01bd7b2a5bb2",
      "inputSchema": {
        "type": "object",
        "properties": {
          "topic": { "type": "string" },
          "ageRange": { "type": "string", "enum": ["3-5", "6-8", "9-12"] },
          "language": { "type": "string" }
        },
        "required": ["topic", "ageRange"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "content": { "type": "string" },
          "summary": { "type": "string" }
        },
        "required": ["title", "content"]
      }
    },
    {
      "id": "translateText",
      "name": "Translate Text",
      "workflowId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "targetLang": { "type": "string" },
          "formality": { "type": "string", "enum": ["formal", "informal"] }
        },
        "required": ["text", "targetLang"]
      }
    }
  ]
}
```

### JSON Schema → zod mapping

| JSON Schema | zod |
|---|---|
| `{ "type": "string" }` | `z.string()` |
| `{ "type": "number" }` | `z.number()` |
| `{ "type": "integer" }` | `z.number().int()` |
| `{ "type": "boolean" }` | `z.boolean()` |
| `{ "type": "string", "enum": ["a","b"] }` | `z.enum(['a', 'b'])` |
| `{ "type": "array", "items": { "type": "string" } }` | `z.array(z.string())` |
| `{ "type": "object", "properties": { ... } }` | `z.object({ ... })` |
| Field NOT in `required[]` | append `.optional()` |

### Generated zod schemas from the example manifest

```ts
import { z } from 'zod'

// ── generateStory ─────────────────────────────────────────────
export const generateStoryInputSchema = z.object({
  topic: z.string(),
  ageRange: z.enum(['3-5', '6-8', '9-12']),
  language: z.string().optional(),
})
export type GenerateStoryInput = z.infer<typeof generateStoryInputSchema>

export const generateStoryOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  summary: z.string().optional(),
})
export type GenerateStoryOutput = z.infer<typeof generateStoryOutputSchema>

// ── translateText ─────────────────────────────────────────────
export const translateTextInputSchema = z.object({
  text: z.string(),
  targetLang: z.string(),
  formality: z.enum(['formal', 'informal']).optional(),
})
export type TranslateTextInput = z.infer<typeof translateTextInputSchema>
```

Do not make required output fields optional to silence validation failures. Do not add
`.passthrough()` as a workaround for EAX execution envelopes. `defineAiAction` validates the
workflow `finalResult` payload when an `outputSchema` is configured.

---

## Full Generated `src/lib/sdk.ts`

Combining both manifests from the examples above:

```ts
// src/lib/sdk.ts
// Generated from .howone/database/manifest.json and .howone/ai/manifest.json
import {
  createClient,
  defineAiAction,
  defineAiActions,
  defineEntities,
  runAiActionAndPersist,
  type EntityDefinition,
  type EntityRecord,
  withAiActions,
  withEntities,
} from '@howone/sdk'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════
// ENTITY TYPES
// ═══════════════════════════════════════════════════════════════

export type StoryRecord = EntityRecord & {
  title: string
  content: string
  authorId: string
  status: 'draft' | 'published' | 'archived'
  wordCount: number
  tags?: string[]
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

export type CommentRecord = EntityRecord & {
  storyId: string
  authorId: string
  body: string
  likes?: number
}
export type CommentCreate = {
  storyId: string
  authorId: string
  body: string
  likes?: number
}
export type CommentUpdate = Partial<CommentCreate>

export const storyEntityDefinition = {
  name: 'Story',
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
    authorId: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    wordCount: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
    coverUrl: { type: 'string' },
  },
  required: ['title', 'content', 'authorId', 'status', 'wordCount'],
  access: {
    authenticated: { read: 'own', create: 'own', update: 'own', delete: 'own' },
    public: { read: 'none', create: 'none', update: 'none', delete: 'none' },
  },
} satisfies EntityDefinition

export const commentEntityDefinition = {
  name: 'Comment',
  type: 'object',
  properties: {
    storyId: { type: 'string' },
    authorId: { type: 'string' },
    body: { type: 'string' },
    likes: { type: 'integer' },
  },
  required: ['storyId', 'authorId', 'body'],
  access: {
    authenticated: { read: 'own', create: 'own', update: 'own', delete: 'own' },
    public: { read: 'none', create: 'none', update: 'none', delete: 'none' },
  },
} satisfies EntityDefinition

// ═══════════════════════════════════════════════════════════════
// AI SCHEMAS & TYPES
// ═══════════════════════════════════════════════════════════════

export const generateStoryInputSchema = z.object({
  topic: z.string(),
  ageRange: z.enum(['3-5', '6-8', '9-12']),
  language: z.string().optional(),
})
export type GenerateStoryInput = z.infer<typeof generateStoryInputSchema>
export const generateStoryOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  summary: z.string().optional(),
})
export type GenerateStoryOutput = z.infer<typeof generateStoryOutputSchema>

export const translateTextInputSchema = z.object({
  text: z.string(),
  targetLang: z.string(),
  formality: z.enum(['formal', 'informal']).optional(),
})
export type TranslateTextInput = z.infer<typeof translateTextInputSchema>

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})

// ═══════════════════════════════════════════════════════════════
// ENTITY BINDINGS
// ═══════════════════════════════════════════════════════════════

export const entities = defineEntities({
  Story: client.entity<StoryRecord, StoryCreate, StoryUpdate>('Story'),
  Comment: client.entity<CommentRecord, CommentCreate, CommentUpdate>('Comment'),
})

// ═══════════════════════════════════════════════════════════════
// AI ACTION BINDINGS
// ═══════════════════════════════════════════════════════════════

export const ai = defineAiActions({
  generateStory: defineAiAction('generateStory', {
    workflowId: 'd69ab648-2c00-4d94-928e-01bd7b2a5bb2',
    inputSchema: generateStoryInputSchema,
    outputSchema: generateStoryOutputSchema,
  }),
  translateText: defineAiAction('translateText', {
    workflowId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    inputSchema: translateTextInputSchema,
  }),
})

// ═══════════════════════════════════════════════════════════════
// COMPOSED CLIENT
// ═══════════════════════════════════════════════════════════════

const howone = withAiActions(withEntities(client, entities), ai)
export default howone
```

---

## Codegen Checklist

Before finalising generated code, verify:

- [ ] Every entity from `.howone/database/manifest.json` has a `Record`, `Create`, and `Update` type
- [ ] Entity definitions are exported as `*EntityDefinition` when app code needs payload/query guards
- [ ] `Create` types are defined **explicitly** (not via `Omit`)
- [ ] Create optionality accounts for `required`, `default`, `defaultValue`, `autoGenerate`, and nullable types
- [ ] System fields are not present in create/update input types
- [ ] Public query/write types are generated only from `access.public.allowedFilters`, `allowedSorts`, `requiredScopes`, and write permissions
- [ ] Every AI action from `.howone/ai/manifest.json` has an `inputSchema` zod object
- [ ] Every AI action with manifest `outputSchema` has a matching zod `outputSchema`
- [ ] Every AI action binding includes the exact manifest `workflowId`
- [ ] Required input fields are not `.optional()` in zod
- [ ] Required output fields are not `.optional()` in zod
- [ ] AI output schemas do not use `.passthrough()` to hide execution-envelope mismatches
- [ ] AI action names match the manifest `id` exactly (case-sensitive)
- [ ] `createClient` uses `import.meta.env.*` only
- [ ] `withEntities` is applied before `withAiActions` in the composition chain
- [ ] No generated source files are placed under `.howone/`
- [ ] Exported types and schemas are importable from `@/lib/sdk`

---

## Incremental Update Pattern

When new entities or actions are added to the manifests, update `src/lib/sdk.ts` by:

1. Reading the current `src/lib/sdk.ts` to preserve existing bindings and import style.
2. Appending new types, schemas, entity bindings, and action bindings.
3. Not removing existing bindings unless the manifest explicitly removed them.
4. Preserving export names for backward compatibility with existing UI code.

```ts
// Before (existing)
export const entities = defineEntities({
  Story: client.entity<StoryRecord, StoryCreate, StoryUpdate>('Story'),
})

// After (added Comment entity from new manifest)
export const entities = defineEntities({
  Story: client.entity<StoryRecord, StoryCreate, StoryUpdate>('Story'),
  Comment: client.entity<CommentRecord, CommentCreate, CommentUpdate>('Comment'),
})
```

---

## AI-First Persistence Pattern

When the app generates data with AI and saves it to an entity:

1. Read `.howone/ai/manifest.json` to know the typed AI output.
2. Decide which output fields are durable product fields.
3. Add app-specific persistence fields such as `status`, `errorMessage`, `requestedAt`,
   `completedAt`, source URLs, prompt/options, or share state.
4. Define/update the entity schema from product persistence needs, not by blindly copying
   `outputSchema`.
5. Generate entity types and AI action bindings from synced manifests.
6. Use `runAiActionAndPersist()` for history-style products.

```ts
// AI generates: { title: string, content: string, summary: string }
// Save it to Story entity which adds: authorId, status, wordCount

async function generateAndSave(input: GenerateStoryInput, authorId: string) {
  const output = await howone.ai.generateStory.run(input)

  return howone.entities.Story.create({
    title: output.title,
    content: output.content,
    authorId,
    status: 'draft',
    wordCount: output.content.split(' ').length,
  })
}
```

History-style generation should create a pending record before running AI:

```ts
await runAiActionAndPersist({
  entity: howone.entities.Generation,
  input,
  createPending: (input) => ({
    prompt: input.topic,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  }),
  run: (input) => howone.ai.generateStory.run(input),
  mapCompleted: ({ output }) => ({
    status: 'completed',
    title: output.title,
    content: output.content,
    completedAt: new Date().toISOString(),
  }),
})
```
