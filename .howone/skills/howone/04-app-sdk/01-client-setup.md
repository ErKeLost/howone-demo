# Client Setup

**Track:** `04-app-sdk/` — implement HowOne in the app from synced manifests; not schema/AI design.

## createClient

`createClient(opts: CreateClientOptions)` is the single factory for everything in the HowOne SDK. Call it once at module level and export the result (or the composed `howone` client).

### CreateClientOptions — full type

```ts
type Environment = 'local' | 'dev' | 'prod'

type CreateClientOptions = {
  // ── Required ──────────────────────────────────────────────
  projectId?: string           // Your HowOne project ID (set via VITE_HOWONE_PROJECT_ID)

  // ── Environment ───────────────────────────────────────────
  env?: Environment | string   // 'local' | 'dev' | 'prod'  (set via VITE_HOWONE_ENV)
  apiUrl?: string              // Override the REST API base URL
  aiUrl?: string               // Override the AI/SSE base URL

  // ── Behaviour ─────────────────────────────────────────────
  caseStyle?: 'camel' | 'snake' // Default: 'camel'
  mode?: 'auto' | 'standalone' | 'embedded'

  // ── Auth (one parameter for custom login) ─────────────────
  auth?: 'custom' | 'hosted' | 'headless' | 'none' | {
    mode?: 'custom' | 'hosted' | 'headless' | 'none' | 'managed'
    loginPath?: string   // default '/login' when mode is 'custom'
    logoutPath?: string
    guard?: 'required' | 'optional' | 'none'
    getToken?: () => Promise<string | null>
    adapter?: AuthAdapter
    tokenCacheMs?: number
  }
  loginPath?: string     // shorthand when auth is 'custom'
  logoutPath?: string

  // ── Limit-exceeded callbacks ───────────────────────────────
  limitExceeded?: {
    onLimitExceeded?: (context: LimitExceededContext) => void
    showUpgradeToast?: boolean
    upgradeUrl?: string
  }

  // ── Deprecated — do not use in new code ───────────────────
  appId?: string        // Use projectId
  baseUrl?: string      // Use apiUrl / aiUrl
  apiBaseUrl?: string   // Use apiUrl
  aiBaseUrl?: string    // Use aiUrl
  authRequired?: boolean // Use auth.mode
}
```

### What createClient returns

```ts
const client = createClient({ ... })

client.projectId        // string — resolved project ID
client.appId            // string — alias for projectId
client.caseStyle        // 'camel' | 'snake'

// Entity factory
client.entity<TRecord, TCreate, TUpdate>(entityName: string): EntityClient

// Typed entity map (populated via withEntities)
client.entities: Record<string, EntityClient>

// Public entity namespace (never sends Authorization)
client.public.entity<TRecord, TPublicCreate, TPublicUpdate>(entityName: string): PublicEntityClient
client.public.entities: Record<string, PublicEntityClient>
client.public.raw: RawHttpClient

// Schema contract/version client
client.schema.listDefinitions()
client.schema.getDefinition(entityName)
client.schema.operate(operation)
client.schema.applyPatch(patch, { expectedVersionId, reason })
client.schema.getState()
client.schema.listVersions()
client.schema.getVersion(versionId)
client.schema.restore(versionId, reason?)

// AI action runner (low-level)
client.ai: AiClient

// HTTP utilities (low-level — see 04-app-sdk/06-raw-http.md)
client.raw: RawHttpClient

// File upload
client.upload.file(file, options?)
client.upload.image(file)
client.upload.batch(options)

// User profile
client.me(options?)        // Promise<UserProfile | null>
client.requireMe(options?) // Promise<UserProfile>  throws if unauthenticated
client.session.user()      // alias for client.me()

// Auth helpers (behavior driven by createClient auth mode)
client.auth.mode          // 'custom' | 'hosted' | 'headless' | 'none'
client.auth.loginPath     // e.g. '/login'
client.auth.setToken(token: string | null)
client.auth.getToken(): string | null
client.auth.isAuthenticated(): boolean
client.auth.login(returnUrl?: string)
await client.auth.logout()
await client.auth.clearSession({ redirect?: false | string })
client.auth.subscribe((state) => { ... }) // auth state callback

// URL utilities
client.sanitizeUrl(opts?: { clearAll?: boolean; sensitiveParams?: string[] })
```

---

## Standard Vite Setup

```ts
// src/lib/sdk.ts
import {
  createClient,
  defineAiAction,
  defineAiActions,
  defineEntities,
  pickEntityPayload,
  runAiActionAndPersist,
  type EntityRecord,
  withAiActions,
  withEntities,
} from '@howone/sdk'
import { z } from 'zod'

// ── 1. Create client ─────────────────────────────────────────
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})

// ── 2. Define entity types & bind ────────────────────────────
// (see 04-app-sdk/02-entity-operations.md for full details)
export type NoteRecord = EntityRecord & { title: string; body: string }
export type NoteCreate = { title: string; body: string }
export type NoteUpdate = Partial<NoteCreate>

export const entities = defineEntities({
  Note: client.entity<NoteRecord, NoteCreate, NoteUpdate>('Note'),
})

// ── 3. Define AI actions ─────────────────────────────────────
// (see 04-app-sdk/07-ai-action-calls.md for full details)
export const summarizeInputSchema = z.object({ noteId: z.string() })
export type SummarizeInput = z.infer<typeof summarizeInputSchema>

export const ai = defineAiActions({
  summarizeNote: defineAiAction('summarizeNote', {
    inputSchema: summarizeInputSchema,
  }),
})

// ── 4. Compose and export ────────────────────────────────────
const howone = withAiActions(withEntities(client, entities), ai)
export default howone
```

SDK utility exports that generated apps may use:

| Utility | Use |
|---|---|
| `pickEntityPayload(definition, payload)` | Keep only schema-declared business fields before create/update. |
| `validateEntityPayload(definition, payload)` | Return structured issues for unknown/system/ownership/missing required fields. |
| `assertEntityPayload(definition, payload)` | Throw structured `EntityPayloadValidationError` before unsafe writes. |
| `validatePublicEntityQuery(definition, options)` | Check public filters, sorts, scopes, and limits against `access.public`. |
| `assertPublicEntityQuery(definition, options)` | Throw before generating an invalid public query. |
| `runAiActionAndPersist(options)` | Standard pending-first AI execution + entity persistence helper. |

---

## Environment Variables

In Vite apps, these two env vars are mandatory:

```
VITE_HOWONE_PROJECT_ID=proj_xxxxxxxxxxxxxxxx
VITE_HOWONE_ENV=prod
```

Rules:
- **Do not** add `?? 'prod'` or `?? ''` fallbacks. Missing env vars should surface as misconfiguration errors.
- **Do not** hardcode project IDs in source. Use the env var.
- `env` accepts `'local'`, `'dev'`, or `'prod'`. **Auth OTP/OAuth, entities, AI, and uploads all use this same env.**
- Import `src/lib/sdk.ts` before calling `loginWithEmailCode` / `unifiedAuth` so env is pinned (otherwise auth defaults to prod APIs).

| `env` | API base | Auth API example |
|-------|----------|------------------|
| `local` | `http://localhost:3002/api` | `http://localhost:3002/api/auth/email/send-code` |
| `dev` | `https://api.howone.dev/api` | `https://api.howone.dev/api/auth/email/send-code` |
| `prod` | `https://api.howone.ai/api` | `https://api.howone.ai/api/auth/email/send-code` |

---

## Auth Modes

See `04-app-sdk/03-auth.md` for the full custom-login playbook.

```ts
// Default — HowOne hosted login (howone.dev / howone.ai)
createClient({ projectId, env })

// Custom in-app login page; auth APIs still HowOne
createClient({ projectId, env, auth: 'custom', loginPath: '/login' })

// Headless — external JWT provider
createClient({
  projectId,
  env,
  auth: {
    mode: 'headless',
    adapter: {
      getToken: async () => externalAuth.getToken(),
      setToken: (token) => externalAuth.setToken(token),
      login: ({ returnUrl } = {}) => router.push(`/login?redirect=${encodeURIComponent(returnUrl ?? '/')}`),
      logout: () => router.push('/'),
    },
    tokenCacheMs: 60_000,
  },
})

// None — public app, no auth
createClient({ projectId, env, auth: 'none' })
```

---

## Multi-environment Setup

```ts
// src/lib/sdk.ts
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
  // Override URLs only for special deployments
  // apiUrl: import.meta.env.VITE_HOWONE_API_URL,
  // aiUrl: import.meta.env.VITE_HOWONE_AI_URL,
})
```

---

## UserProfile Type

```ts
type UserProfile = {
  id: string
  userId?: string
  puid?: string
  email?: string
  name?: string
  avatarUrl?: string
  appId?: string
  roles?: string[]
  metadata?: Record<string, unknown>
}

// Usage
const me = await client.me()           // null if not logged in
const me = await client.requireMe()    // throws HowOneAuthError if not logged in

// Check auth state programmatically
const isLoggedIn = client.auth.isAuthenticated()
const token = client.auth.getToken()

// Manually set a token (e.g. after custom login flow)
client.auth.setToken(jwtToken)

// Trigger login redirect
client.auth.login('/dashboard') // optional return path

// Logout
client.auth.logout()
```

---

## Client Namespace Rules

- Use `client.entities.*` / `howone.entities.*` for authenticated app data. The backend derives owner from the JWT; do not pass owner filters or owner fields.
- Use `client.public.entities.*` / `howone.public.entities.*` for public landing pages, public article lists, scoped QR/profile pages, and public forms.
- Use `client.schema.*` only for backend contract management: definitions, schema operations, schema patch apply, versions, and restore.
- Use `client.raw.*` only for custom endpoints not covered by typed SDK methods.

---

## HowOneAuthError

```ts
import { HowOneAuthError } from '@howone/sdk'

try {
  const user = await client.requireMe()
} catch (err) {
  if (err instanceof HowOneAuthError) {
    // err.code === 'UNAUTHENTICATED'
    client.auth.login()
  }
}
```

---

## LimitExceeded Handling

```ts
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
  limitExceeded: {
    showUpgradeToast: true,
    upgradeUrl: 'https://howone.app/upgrade',
    onLimitExceeded: (context) => {
      console.error('Limit exceeded:', context.source, context.message)
      // context.source: 'axios-response' | 'workflow-executor-sse' | ...
      // context.status: HTTP status code (if available)
    },
  },
})
```
