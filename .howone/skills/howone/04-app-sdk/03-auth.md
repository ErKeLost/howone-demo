# Auth

## Environment (read this first — dev must not hit prod)

All auth APIs (`sendEmailVerificationCode`, `loginWithEmailCode`, `unifiedAuth.*`, `howone.auth.logout` revoke) use the **same `env` as `createClient`**, not the browser hostname and not a frozen default.

| `VITE_HOWONE_ENV` / `createClient({ env })` | Auth REST API origin | Hosted login root (`auth: 'hosted'`) |
|---------------------------------------------|----------------------|--------------------------------------|
| `local` | `http://localhost:3002` | `https://howone.dev` |
| `dev` | `https://api.howone.dev` | `https://howone.dev` |
| `prod` | `https://api.howone.ai` | `https://howone.ai` |

```ts
// src/lib/sdk.ts — canonical (no extra auth fields required)
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})
```

Defaults when `auth` is omitted:

- Auth mode: **hosted** — login/logout redirect to HowOne (`howone.dev` / `howone.ai` by `env`)
- Auth APIs still follow `env` (`dev` → `api.howone.dev`, `prod` → `api.howone.ai`)

Custom in-app login UI is **opt-in**: `auth: 'custom'` (see below).

```ts
// main.tsx
import './lib/sdk' // registers env first
import { sendEmailVerificationCode } from '@howone/sdk'
```

Rules for agents:

- **Do not** hardcode `api.howone.ai` or `howone.ai` in app code.
- **Do not** import auth helpers before `./lib/sdk` (env would stay default `prod`).
- **Do not** rely on `localhost` hostname to pick `local`; use `env: 'local'` or `env: 'dev'` explicitly.
- Entity, AI, upload, and auth endpoints all follow this single `env` pin.

---

## Custom login (opt-in only)

Add `auth: 'custom'` when the app renders its own `/login` page but still uses HowOne OTP/OAuth APIs:

```ts
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
  auth: 'custom',
  loginPath: '/login',
})
```

That wires:

| Behavior | Result |
|----------|--------|
| `howone.auth.logout()` | Clears token + revokes server session → stays on your app → navigates to `loginPath` |
| `howone.auth.login()` | Navigates to `loginPath` (never howone.dev / howone.ai) |
| `HowOneProvider` `useHowoneContext().logout()` | Same as `howone.auth.logout()` when `createClient` ran first |

Pair with React:

```tsx
<HowOneProvider auth="none" brand="visible">
  <App />
</HowOneProvider>
```

`auth="none"` on the provider means **no automatic redirect**; route guards call `howone.me()` and `navigate('/login')` yourself. Keep `brand="visible"` unless the user explicitly asks to hide the bottom-right HowOne logo.

| `createClient({ auth })` | Login UI | `auth.login()` | `auth.logout()` default redirect |
|--------------------------|----------|----------------|----------------------------------|
| *(omit)* | **HowOne hosted** | → howone `/auth` | → howone `/auth` |
| `'custom'` | Your `/login` + HowOne APIs | → `loginPath` | → `loginPath` |
| `'hosted'` | HowOne hosted (same as default) | → howone `/auth` | → howone `/auth` |
| `'headless'` | External (Clerk, etc.) | no-op | no redirect |
| `'none'` | N/A (public app) | no-op | no redirect |

Legacy alias: `'managed'` → `'hosted'`.

### Advanced object form

```ts
auth: {
  mode: 'custom',
  loginPath: '/sign-in',
  logoutPath: '/sign-in', // optional; defaults to loginPath
  guard: 'required', // optional; use with HowOneProvider auth="required" for auto-redirect to loginPath
  getToken: async () => null, // only for headless
}
```

---

## Two auth layers

1. **`createClient({ auth })`** — strategy for login/logout destinations (hosted vs custom).
2. **`unifiedAuth` / standalone OTP & OAuth functions** — headless APIs to build your login UI.

React: `HowOneProvider` + `useHowoneContext` — route guard only (`auth="required" | "optional" | "none"`).

The underlying SDK auth state is managed by `AuthManager`. App code normally uses `client.auth`,
`client.me()`, `client.requireMe()`, and `HowOneProvider`; SDK contributors use `AuthAdapter` when
custom token ownership is required.

---

## `client.auth` API

```ts
import howone from '@/lib/sdk'

howone.auth.mode        // 'custom' | 'hosted' | 'headless' | 'none'
howone.auth.guard       // 'required' | 'optional' | 'none'
howone.auth.loginPath   // e.g. '/login'
howone.auth.logoutPath  // e.g. '/login'

howone.auth.setToken(jwt)
howone.auth.getToken()
howone.auth.isAuthenticated()

howone.auth.login(returnUrl?)       // respects auth mode
await howone.auth.logout()          // respects auth mode
await howone.auth.clearSession()    // clear only; redirect: false
await howone.auth.clearSession({ redirect: '/goodbye' })
await howone.auth.logout({ redirect: false })
howone.auth.subscribe((state) => {
  // state: { token, user, isAuthenticated, isLoading }
})
```

---

## AuthManager / AuthAdapter extension point

Use an adapter when the token is owned outside the default HowOne local session, for example an
external auth provider, embedded shell, native app bridge, or custom host application.

```ts
const client = createClient({
  projectId,
  env,
  auth: {
    mode: 'headless',
    adapter: {
      name: 'external-auth',
      getToken: () => externalAuth.getToken(),
      setToken: (token) => externalAuth.setToken(token),
      getUser: async (token) => externalAuth.getUser(token),
      login: ({ returnUrl } = {}) => {
        router.push(`/login?redirect=${encodeURIComponent(returnUrl ?? '/')}`)
      },
      logout: () => {
        externalAuth.clear()
        router.push('/')
      },
      subscribe: (listener) => externalAuth.onChange(() => {
        listener({
          token: externalAuth.getToken(),
          user: externalAuth.getUserSync(),
          isAuthenticated: Boolean(externalAuth.getToken()),
          isLoading: false,
        })
      }),
    },
    tokenCacheMs: 30_000,
  },
})
```

Adapter rules:

- Use `mode: 'headless'` for external token providers.
- Use `mode: 'custom'` for in-app login pages that still call HowOne OTP/OAuth APIs.
- Do not create extra token storage keys in app code. Route all token writes through `client.auth.setToken()`.
- Do not implement app UI in the adapter. It may navigate or notify through callbacks, but visible UI belongs to the app.
- `getToken` may be sync or async; the SDK caches external tokens according to `tokenCacheMs`.
- `subscribe` is optional but recommended when the external auth provider can change outside SDK calls.

---

## Custom login page (full pattern for AI codegen)

### 1. SDK (`src/lib/sdk.ts`)

```ts
import { createClient, defineEntities, withEntities } from '@howone/sdk'

const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})

export default withEntities(client, defineEntities({ /* ... */ }))
```

### 2. Provider (`main.tsx`)

```tsx
import { HowOneProvider } from '@howone/sdk/react'
import './lib/sdk' // registers auth config

<HowOneProvider auth="none" brand="visible">
  <App />
</HowOneProvider>
```

### 3. Login route (`/login`) — your styles, HowOne APIs

```tsx
import {
  sendEmailVerificationCode,
  loginWithEmailCode,
  unifiedAuth,
} from '@howone/sdk'
import howone from '@/lib/sdk'

// Email OTP
const send = await sendEmailVerificationCode(email)
const result = await loginWithEmailCode(email, code)
if (result.success && result.token) {
  howone.auth.setToken(result.token)
  const user = await howone.me({ refresh: true })
  navigate('/')
}

// Google (popup — user stays on your page)
const { token } = await unifiedAuth.initiateGoogleLogin()
howone.auth.setToken(token)

// GitHub
const { token } = await unifiedAuth.initiateGitHubLogin()
howone.auth.setToken(token)
```

Phone OTP: `sendPhoneVerificationCode` + `loginWithPhoneCode` (E.164, e.g. `+8613800138000`).

OAuth full-page callback (optional route `/auth/callback`):

```ts
import { unifiedOAuth } from '@howone/sdk'

const result = unifiedOAuth.checkOAuthCallback()
if (result.success && result.token) {
  howone.auth.setToken(result.token)
  navigate('/')
}
```

### 4. Protected routes

```tsx
useEffect(() => {
  howone.me()
    .then(setUser)
    .catch(() => navigate('/login', { replace: true }))
}, [])
```

Use `howone.me()`, not `howone.auth.isAuthenticated()`, for first load.

### 5. Logout button

```ts
await howone.auth.logout()
// custom mode: already navigates to loginPath; no howone.dev redirect
```

Do **not** call hosted-only patterns when `auth: 'custom'` is set:

- ~~`howone.auth.login()` expecting howone.ai~~ (goes to `/login` instead — OK)
- ~~Manual `window.location` to howone.dev~~

---

## Hosted login (default)

Omit `auth` — this is the default for `createClient({ projectId, env })`:

```ts
createClient({ projectId, env })
```

```tsx
<HowOneProvider auth="required">
  <App />
</HowOneProvider>
```

Unauthenticated users redirect to HowOne hosted `/auth`.

---

## Headless external auth

```ts
createClient({
  projectId,
  env,
  auth: {
    mode: 'headless',
    adapter: {
      getToken: async () => externalAuth.getJwt(),
      login: ({ returnUrl } = {}) => externalAuth.login({ returnUrl }),
      logout: () => externalAuth.logout(),
    },
    tokenCacheMs: 30_000,
  },
})
```

Do not use `howone.auth.setToken` for Clerk/Supabase unless bridging into HowOne JWT.

Headless mode should not redirect to HowOne hosted auth by default. The external adapter decides
what `login` and `logout` mean.

---

## Email / phone / OAuth API reference

(Same as before — see sections below for request/response shapes.)

### Email OTP

```ts
import { sendEmailVerificationCode, loginWithEmailCode } from '@howone/sdk'

await sendEmailVerificationCode(email, appName?)
const result = await loginWithEmailCode(email, code)
// result.token on success → howone.auth.setToken(result.token)
```

### Phone OTP

```ts
import { sendPhoneVerificationCode, loginWithPhoneCode } from '@howone/sdk'
```

### OAuth popup

```ts
import { unifiedAuth } from '@howone/sdk'

await unifiedAuth.initiateGoogleLogin()
await unifiedAuth.initiateGitHubLogin()
```

### Server logout

```ts
import { unifiedAuth } from '@howone/sdk'

const token = howone.auth.getToken()
if (token) await unifiedAuth.logout(token)
await howone.auth.logout()
```

With `auth: 'custom'`, `howone.auth.logout()` already revokes and navigates locally.

---

## User profile

```ts
const user = await howone.me()
const user = await howone.requireMe() // throws HowOneAuthError
```

---

## HowOneAuthError

```ts
import { HowOneAuthError } from '@howone/sdk'

try {
  await howone.requireMe()
} catch (err) {
  if (err instanceof HowOneAuthError) {
    howone.auth.login() // custom → /login; hosted → howone.ai
  }
}
```

---

## Common mistakes (AI agents)

| Mistake | Fix |
|---------|-----|
| Custom `/login` page with HowOne OTP/OAuth | Add `auth: 'custom'` in `createClient` |
| `HowOneProvider auth="required"` + custom login | Use `auth="none"`; guard with `howone.me()` |
| `howone.auth.logout()` expecting no redirect before this change | Now respects `auth: 'custom'` |
| `auth.isAuthenticated()` on first paint | Use `await howone.me()` |
| Phone without country code | E.164 `+86...` |
| JSON Schema in `defineAiAction` | Convert manifest JSON Schema to Zod |
| Second localStorage key for token | Only `howone.auth.setToken` |
| Custom external provider wired with `getToken` only but no logout | Add an `adapter.logout` if the host owns session clearing |
| App UI inside SDK auth adapter | Move UI to frontend components and use callbacks/navigation only |

---

## Non-negotiable for agents

- Default **`createClient({ projectId, env })`** = HowOne hosted login. Add **`auth: 'custom'`** only for in-app login pages.
- Never hardcode howone.dev / howone.ai URLs in app login/logout when `auth: 'custom'`.
- Implement login UI with `sendEmailVerificationCode` / `loginWithEmailCode` / `unifiedAuth` — not iframe to hosted auth.
- After any successful login: `howone.auth.setToken(token)` then `await howone.me({ refresh: true })`.
- Logout: `await howone.auth.logout()` only (no manual redirect needed when `auth: 'custom'`).
- For external auth, use `auth.adapter`; do not patch request headers manually.
- SDK auth exposes state/callbacks only. Visible feedback, loading spinners, account menus, and errors are frontend app code.
