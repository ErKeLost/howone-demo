# Entity Data Access Patterns (App SDK)

Use this reference to connect backend `access` design to frontend SDK calls. It answers:
**which namespace should the app call, which filters are legal, and what must not be persisted?**

For schema design, read `02-entity-schema/01-schema-design.md`. For query syntax details, read
`12-query-dsl-and-responses.md`.

## Namespace Decision

| Schema / page need | SDK namespace | Auth header | Typical method |
|---|---|---|---|
| Current user's private records | `howone.entities.Entity` | yes | `query.mine`, `create`, `update`, `delete` |
| Logged-in shared records | `howone.entities.Entity` | yes | `query`, `get`, CRUD |
| Public list page | `howone.public.entities.Entity` | no | `query` |
| Public scoped share/detail | `howone.public.entities.Entity` | no | `queryScoped`, `get` with scope options |
| Schema tooling | `howone.schema` | yes | `applyPatch`, versions, restore |
| Low-level fallback | `howone.raw` / `howone.public.raw` | depends | only when typed method missing |

Do not mix authenticated and public namespaces for the same page without a clear reason.

## Pattern A: Private Per-User Data

Use for todos, notes, journals, saved generations, personal dashboards, private settings.

Schema:

```json
{
  "visibility": "private",
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  }
}
```

Frontend:

```ts
const list = await howone.entities.Todo.query.mine({
  page: { number: 1, size: 50 },
  orderBy: { updatedDate: 'desc' },
})

await howone.entities.Todo.create({
  text,
  completed: false,
})
```

Rules:

- Do not pass `ownerId`, `created_by_id`, `createdById`, `created_by_user_id`, or `puid`.
- Backend derives owner from JWT/session.
- Use `query.mine()` for owned lists.
- For first auth load, call `await howone.me()` or `await howone.requireMe()`.

## Pattern B: Authenticated Shared Data

Use when logged-in app users can see shared records: team projects, CMS admin, internal catalogs.

Schema:

```json
{
  "visibility": "private",
  "access": {
    "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  }
}
```

Frontend:

```ts
const list = await howone.entities.Project.query({
  page: { number: 1, size: 20 },
  orderBy: { updatedDate: 'desc' },
})
```

Rules:

- Use `query()`, not `query.mine()`.
- Still require auth.
- Be conservative with `update: "all"` and `delete: "all"` unless the app has a real role model.

## Pattern C: Public Read-Only Content

Use for public articles, templates, products, profiles, published galleries.

Schema:

```json
{
  "visibility": "public",
  "access": {
    "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
    "public": {
      "read": "list",
      "create": "none",
      "update": "none",
      "delete": "none",
      "allowedFilters": ["slug", "status", "category"],
      "allowedSorts": ["publishedAt", "updatedDate"],
      "defaultLimit": 20,
      "maxLimit": 100
    }
  }
}
```

Frontend:

```ts
const list = await howone.public.entities.Article.query({
  where: { status: 'published', category },
  page: { number: 1, size: 20 },
  orderBy: { publishedAt: 'desc' },
})
```

Rules:

- Public filters must be in `allowedFilters`.
- Public sorts must be in `allowedSorts`.
- Never pass tokens or use authenticated namespace for anonymous landing pages.
- Keep public result fields safe for anonymous users.

## Pattern D: Public Scoped Share Pages

Use for public URLs exposing one scoped record: QR profile, public report, resume, invite page.

Schema:

```json
{
  "visibility": "public",
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
  }
}
```

Frontend:

```ts
const result = await howone.public.entities.QrProfile.queryScoped({
  where: { ownerId, slug, active: true },
  page: { number: 1, size: 1 },
})
const profile = result.items[0] ?? null
```

Rules:

- Pass every `requiredScopes` field.
- Do not use current JWT `puid` as `ownerId` unless schema explicitly stores that as public scope.
- Do not turn scoped pages into broad list pages.
- Keep `maxLimit` small.

## Pattern E: Public Create / Anonymous Submission

Use only for forms that must accept anonymous/public submissions: waitlist, contact, feedback,
public RSVP.

Schema:

```json
{
  "visibility": "public",
  "access": {
    "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
    "public": {
      "read": "none",
      "create": "scoped",
      "update": "none",
      "delete": "none",
      "requiredScopes": ["created_by_user_id"],
      "allowedFilters": [],
      "allowedSorts": [],
      "defaultLimit": 1,
      "maxLimit": 1
    }
  }
}
```

Frontend:

```ts
await howone.public.entities.Feedback.create({
  created_by_user_id: projectUserId,
  message,
  rating,
})
```

Rules:

- Public create needs a clear `created_by_user_id` source when backend requires ownership mapping.
- Do not expose public read unless needed.
- Add anti-abuse UX/server constraints outside the dynamic schema when needed.
- Never persist UI-only fields from form components.

## Pattern F: AI Workflow Output Persistence

Use for generation/analyze/report products that need history and refresh resilience.

Recommended flow:

```ts
const pending = await howone.entities.Generation.create({
  prompt,
  status: 'pending',
})

try {
  const output = await howone.ai.generateImage.run({ prompt })
  await howone.entities.Generation.update(pending.id, {
    status: 'completed',
    resultUrl: output.imageUrl,
    completedAt: new Date().toISOString(),
  })
} catch (error) {
  await howone.entities.Generation.update(pending.id, {
    status: 'failed',
    errorMessage: error instanceof Error ? error.message : 'Generation failed',
  })
}

const history = await howone.entities.Generation.query.mine({
  orderBy: { updatedDate: 'desc' },
  page: { number: 1, size: 20 },
})
```

Rules:

- Persist only fields declared in the entity schema.
- Do not persist raw workflow event streams unless schema defines an object/array field for them.
- Failure branch must persist failure if the product shows history.
- Latest result, history list, and detail pages should reload from data API, not only local state.

## Payload Whitelist Rule

Before every create/update, mentally compute:

```text
payload keys ⊆ entity.properties keys
```

Allowed:

```ts
await howone.entities.Todo.create({
  text,
  completed: false,
})
```

Forbidden:

```ts
await howone.entities.Todo.create({
  text,
  completed: false,
  gradient_direction: 'to right', // UI-only
  created_by_id: user.id,         // system/owner field
  workflowRawResult: output,      // undeclared workflow envelope
})
```

If the app truly needs a new persisted field, update schema first.

## Access-to-SDK Mapping

| Access posture | Read | Create | Update/Delete |
|---|---|---|---|
| authenticated `own` | `entities.X.query.mine()` | `entities.X.create()` | `entities.X.update/delete()` |
| authenticated `all` | `entities.X.query()` | `entities.X.create()` | `entities.X.update/delete()` |
| public `list` | `public.entities.X.query()` | no | no |
| public `scoped` | `public.entities.X.queryScoped()` | only if `create: scoped/any` | only if `update: scoped/any` |
| public `none` | no public call | no public call | no public call |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Passing `created_by_user_id` for normal private data | Omit owner fields; backend derives owner. |
| Using `entities.*` on public page | Use `public.entities.*`. |
| Public filter not in `allowedFilters` | Add filter to schema or remove query. |
| Public sort not in `allowedSorts` | Add sort to schema or change UI. |
| Saving workflow output object directly | Map only declared fields. |
| Rendering history only from local state | Reload via `query.mine()` / public query. |
| Treating `visibility: "public"` as enough | Always define `access.public`. |
