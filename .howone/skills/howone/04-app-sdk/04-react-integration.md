# React Integration

## What `@howone/sdk/react` Provides

Thin integration layer: auth context plus the HowOne floating brand button. **No** entity hooks,
AI hooks, toast system, redirect overlay, or app-owned UI.

Exports:

- `HowOneProvider`
- `useHowoneContext`
- `FloatingButton`

---

## Auth: one SDK config + one Provider flag

**Step 1 — `src/lib/sdk.ts` (required):**

```ts
const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})
```

**Step 2 — Provider:**

```tsx
import { HowOneProvider } from '@howone/sdk/react'
import './lib/sdk' // must import before Provider so auth config is registered

<HowOneProvider auth="none" brand="visible">
  <App />
</HowOneProvider>
```

| Layer | Setting | Meaning |
|-------|---------|---------|
| `createClient` | `{ projectId, env }` (default **hosted**) | Login/logout → HowOne `/auth` |
| `createClient` | `auth: 'custom'` | Login/logout → your `loginPath`; APIs still HowOne |
| `HowOneProvider` | `auth="required"` | Default with hosted — redirect to HowOne login |
| `HowOneProvider` | `auth="none"` | Use with `auth: 'custom'`; guard routes yourself |

Default (HowOne hosted login):

```tsx
createClient({ projectId, env })
<HowOneProvider auth="required" />
```

Custom login page (your UI, HowOne auth APIs, keep HowOne logo unless product asks to hide it):

```tsx
createClient({ projectId, env, auth: 'custom', loginPath: '/login' })
<HowOneProvider auth="none" brand="visible" />
```

---

## HowOneProvider

```tsx
<HowOneProvider
  auth="none"
  brand="visible"
  onAuthRedirect={({ mode, returnUrl }) => {
    // App may set its own loading/redirect state here.
  }}
  onAuthStateChange={(state) => {
    // App may update analytics or local UI state here.
  }}
>
  <App />
</HowOneProvider>
```

### HowOneProviderProps

```ts
type HowOneProviderAuth = 'required' | 'optional' | 'none'

interface HowOneProviderProps {
  children: React.ReactNode
  projectId?: string // prefer createClient projectId
  auth?: HowOneProviderAuth
  brand?: 'visible' | 'hidden'
  showBrandButton?: boolean
  theme?: 'dark' | 'light' | 'system' | 'inherit'
  onAuthStateChange?: (state: AuthState) => void
  onAuthRedirect?: (info: { mode: 'hosted' | 'custom'; returnUrl: string }) => void
}
```

**Important:** Provider `auth` is only a **route guard**. Login/logout URLs come from `createClient({ auth: 'custom' })`.

The provider must not render app-owned UI. It does not own toasts, dialogs, pages, custom login UI,
or redirect overlays. It does keep the bottom-right HowOne logo by default through `FloatingButton`.
Use `brand="hidden"` or `showBrandButton={false}` only when the product explicitly asks to hide it.

---

## useHowoneContext

```ts
const { user, token, isAuthenticated, logout } = useHowoneContext()
```

### Logout

```tsx
<button onClick={() => void logout()}>Sign out</button>
```

With `auth: 'custom'`, `logout()` clears session and navigates to `loginPath` — **not** howone.dev.

Equivalent:

```ts
await howone.auth.logout()
```

### Custom login page link

```tsx
import { useNavigate } from 'react-router-dom'
import howone from '@/lib/sdk'

function Header() {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useHowoneContext()

  if (!isAuthenticated) {
    return <button onClick={() => navigate(howone.auth.loginPath)}>Sign in</button>
  }

  return <button onClick={() => void logout()}>Sign out</button>
}
```

---

## FloatingButton

The bottom-right HowOne logo is part of the SDK React integration and should remain visible by
default. It does not replace your login page and does not perform app auth. Hide it only with
`brand="hidden"` or `showBrandButton={false}`.

---

## Protected route pattern

```tsx
function ProtectedPage() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    howone.me()
      .then(setUser)
      .catch(() => navigate(howone.auth.loginPath, { replace: true }))
  }, [navigate])

  if (!user) return null
  return <div>Welcome {user.name}</div>
}
```

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Custom UI but no `auth: 'custom'` | Add to `createClient` |
| `HowOneProvider auth="required"` without custom SDK auth | Hosted redirect to howone.ai |
| `useHowoneContext` without Provider | Wrap app in `HowOneProvider` |
| Import Provider before `./lib/sdk` | Import sdk module first |
| Manual redirect to howone.dev on logout | Use `howone.auth.logout()` |
| Deleting the bottom-right HowOne logo by default | Keep `brand="visible"` unless explicitly asked to hide it |
| Expecting SDK toast APIs | Implement visible feedback in the frontend app from callbacks/results |

---

## Import map

| Need | Import |
|------|--------|
| Provider, context | `@howone/sdk/react` |
| Client, OTP, OAuth | `@howone/sdk` |
| App singleton | `@/lib/sdk` default export |
