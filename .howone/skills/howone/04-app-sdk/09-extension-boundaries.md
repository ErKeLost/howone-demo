# SDK Extension Boundaries

This reference defines the long-term shape of `@howone/sdk`. Use it whenever changing SDK APIs,
adding new capabilities, or deciding whether behavior belongs in the SDK or in the generated app.

## North Star

The SDK is an AI-first runtime, not an app UI framework.

It should provide:

- stable defaults that work with almost no configuration;
- typed clients for HowOne platform capabilities;
- adapters for custom behavior;
- callbacks/events for app UI;
- predictable names that AI agents can reuse without guessing.

It should not provide:

- app-owned pages, modals, toasts, or business UI;
- hardcoded app flows beyond HowOne platform defaults;
- hidden persistence side effects;
- provider-specific branches scattered through feature code.

## Default + Adapter Rule

Every platform capability should follow the same shape:

```ts
createClient({
  projectId,
  env,
  auth: 'hosted', // default
})
```

Advanced usage should opt into typed adapters:

```ts
createClient({
  projectId,
  env,
  auth: {
    mode: 'headless',
    adapter: {
      getToken: () => externalAuth.getToken(),
      setToken: (token) => externalAuth.setToken(token),
      login: ({ returnUrl }) => appRouter.push(`/login?redirect=${encodeURIComponent(returnUrl ?? '/')}`),
      logout: () => appRouter.push('/'),
    },
  },
})
```

Do not add one-off flags when an adapter/callback can express the behavior.

## Capability Boundaries

| Capability | SDK owns | App owns |
|---|---|---|
| Auth | token source, session state, login/logout destination policy, hosted HowOne defaults | login page visuals, account menu, loading states, auth error UI |
| React provider | context, auth callbacks, optional bottom-right HowOne `FloatingButton` logo | layout, toasts, overlays, route components, theme system |
| Entities | typed CRUD/query clients, public/private routing, payload normalization | forms, list rendering, optimistic UI, field-level UX |
| Schema | definition operations, apply/version/restore calls | migration approval UI, admin experience |
| Entity contract utilities | payload whitelisting, public query guardrail validation, structured validation issues | deciding product copy, rendering validation errors |
| AI workflows | run/stream/events, Zod validation, workflowId binding | progress UI, result rendering, failure surfaces |
| AI persistence | pending-first orchestration helper, state callbacks, completed/failed mapping hook | choosing schema fields, retry UX, visible state UI |
| Upload | file/image/batch helpers and callbacks | picker UI, previews, validation copy, uploaded-file placement |
| Raw HTTP | low-level escape hatch | choosing it only when typed SDK surface does not exist |

## React Provider Boundary

`HowOneProvider` may render the HowOne bottom-right logo via `FloatingButton`. This is platform
branding and should remain visible by default.

It must not render:

- toast notifications;
- redirect overlays;
- login/register forms;
- payment dialogs;
- app theme wrappers;
- app-specific navigation.

Use callbacks instead:

```tsx
<HowOneProvider
  auth="required"
  brand="visible"
  onAuthRedirect={({ mode, returnUrl }) => {
    setAuthUi({ redirecting: true, mode, returnUrl })
  }}
  onAuthStateChange={(state) => {
    setCurrentUser(state.user)
  }}
>
  <App />
</HowOneProvider>
```

Hide the logo only when explicitly requested:

```tsx
<HowOneProvider brand="hidden" />
<HowOneProvider showBrandButton={false} />
```

## UI Feedback Rule

Do not add `ClayxToast`, `toast`, or any visible notification API to `@howone/sdk`.

Generated apps should write their own UI from SDK results:

```ts
setStatus({ type: 'loading', message: 'Generating...' })

try {
  const output = await howone.ai.generateImage.run({ prompt })
  setStatus({ type: 'success', message: 'Done', output })
} catch (error) {
  setStatus({
    type: 'error',
    message: error instanceof Error ? error.message : 'Generation failed',
  })
}
```

For streaming workflows, use callbacks/events:

```ts
const session = howone.ai.generateImage.stream(
  { prompt },
  {
    onStreamContent: (delta) => appendLog(delta),
    onProgress: (progress) => setProgress(progress),
    onError: (error) => setStatus({ type: 'error', message: error.message }),
    onComplete: (result) => setResult(result.finalResult),
  },
)
```

## Auth Adapter Contract

Use `AuthAdapter` for custom/headless auth. It is the only supported extension point for token
ownership outside the SDK defaults.

```ts
type AuthAdapter = {
  name?: string
  getToken?: () => string | null | Promise<string | null>
  setToken?: (token: string | null) => void | Promise<void>
  getUser?: (token: string | null) => AuthUser | null | Promise<AuthUser | null>
  login?: (options?: { returnUrl?: string }) => void | Promise<void>
  logout?: (options?: { redirect?: false | string | { url: string; external?: boolean } }) => void | Promise<void>
  clearSession?: (options?: { redirect?: false | string | { url: string; external?: boolean } }) => void | Promise<void>
  subscribe?: (listener: (state: AuthState) => void) => (() => void) | void
}
```

Rules:

- Default hosted auth must work without an adapter.
- External providers must use `mode: 'headless'` plus `adapter`.
- Custom in-app HowOne login should usually use `mode: 'custom'`, `loginPath`, and SDK OTP/OAuth helpers.
- `client.me()` and `client.requireMe()` are the canonical user APIs.
- `client.auth.isAuthenticated()` is a quick token check, not a first-load user fetch.

## AI Agent Design Rules

Generated app code should have one stable SDK singleton:

```ts
import howone from '@/lib/sdk'
```

Agents should prefer:

1. `howone.entities.*` for private/authenticated data;
2. `howone.public.entities.*` for public access;
3. `pickEntityPayload()` / `assertEntityPayload()` when mapping broad UI or AI objects to entity writes;
4. `assertPublicEntityQuery()` when generated code has access to the synced definition;
5. `howone.ai.*` for workflow execution;
6. `runAiActionAndPersist()` when the product needs durable AI history;
7. `howone.upload.*` for files;
8. `howone.schema.*` for schema tools;
9. `howone.raw` only as escape hatch.

Agents must not:

- hardcode HowOne URLs;
- manually build workflow SSE URLs;
- call workflows by display name instead of UUID;
- persist UI-only or workflow-extra fields;
- add frontend UI APIs to the SDK;
- remove the default HowOne floating logo unless explicitly asked.

## Adding New SDK Capabilities

When adding a new capability, choose one of these shapes:

```ts
client.capability.method(input, options)
client.capability.stream(input, callbacks)
client.capability.configure(adapter)
```

Prefer these names:

- `run` for one-shot AI/workflow execution;
- `stream` for session-based execution with callbacks;
- `events` for async iterables;
- `query/list/get/create/update/delete` for entities;
- `configure` only for adapters, not app UI.

Keep returned values serializable and obvious. AI agents should be able to inspect the method name
and infer the contract.

## Compatibility Rule

Do not break existing generated apps lightly. Prefer:

- add new adapter/callback options;
- keep old string shorthand (`auth: 'custom'`) working;
- mark old UI props as deprecated/no-op only when needed;
- update this skill and the relevant numbered reference in the same change.
