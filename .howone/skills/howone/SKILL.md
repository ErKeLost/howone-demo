---
name: howone
description: 'Use when deciding whether HowOne can satisfy a user request, or when the task touches HowOne platform contracts or app runtime: backend dynamic entity schemas, public/private access, database-backed persisted data, AI capabilities/workflows, external-ai workflow create/update/status, .howone manifests, src/lib/sdk.ts, auth/uploads, or app code that calls @howone/sdk/howone.*. Do not use for UI-only edits with no HowOne data, AI, auth, upload, manifest, or SDK surface.'
---

# HowOne

HowOne builds generated full-stack AI apps. Platform contracts are separate from app implementation:

- Backend: dynamic entity contracts backed by HowOne's MongoDB runtime.
- AI: capability contracts and external workflow generation/editing.
- SDK: app-side runtime bindings and calls after manifests are synced.

Load only the track needed for the user's request. Do not read SDK files while designing backend or AI contracts unless the task has reached manifest-to-code implementation.

## Trigger Preconditions

Use this skill before work when any condition is true:

- You need to decide whether HowOne can satisfy the user's request, whether an explicit user-owned integration is outside platform contracts, or whether the request needs clarification before handoff.
- The user asks for persisted app data, backend schema, entity fields, access, indexes, public pages, private history, or Mongo-backed records.
- The user asks for HowOne AI behavior, capability contracts, workflow generation/update/status, or `external-ai`.
- The work reads or writes `.howone/database/*`, `.howone/ai/*`, `src/lib/sdk.ts`, or app code using `@howone/sdk` / `howone.*`.
- The selected tool is `backend-api-design`, `ai-capability-design`, `sync_schema_artifacts`, `sync_ai_artifacts`, or `external-ai-capability`.
- The implementation needs HowOne auth, upload URLs, public/private entity access, or manifest-to-SDK bindings.

Skip this skill only when the task is purely UI/static code and does not touch HowOne data, AI,
auth, upload, manifests, or SDK calls.

## First Decision

Classify the request before tool writes:

| User need | Track | Tools/files |
|---|---|---|
| Persist HowOne app data | Backend | `backend-api-design`, `sync_schema_artifacts`, backend files under `02-entity-schema/` |
| Add/change HowOne AI behavior | AI | `ai-capability-design`, `sync_ai_artifacts`, `external-ai-capability`, `03-ai-capabilities/*` |
| Call HowOne from generated app code | SDK | `src/lib/sdk.ts`, synced manifests, `04-app-sdk/*` |
| UI only, no HowOne data or AI | None | edit app code only |
| Explicit user-owned integrations | App-owned | only when the user explicitly asks to connect something outside HowOne; do not reclassify ordinary AI/data/auth app requests |

If multiple tracks apply, process them in dependency order:

```text
architect -> backend contract and/or AI contract -> sync manifests -> SDK bindings -> UI
```

## Mandatory Reads

Always read `01-architect/01-app-generation.md` before the first write to a HowOne platform contract or SDK binding.

Then read the minimum track files:

| Track | Required before writes |
|---|---|
| Backend contract | `02-entity-schema/01-schema-design.md`, `02-entity-schema/02-schema-operations.md` |
| AI contract | `03-ai-capabilities/01-ai-capability-architecture.md`, `03-ai-capabilities/02-workflow-contract-rules.md`, `03-ai-capabilities/03-service-capability-catalog.md` |
| External AI workflow submit/update | `03-ai-capabilities/04-workflow-operations.md` |
| SDK binding/code | `01-architect/02-manifest-codegen.md` plus the relevant `04-app-sdk/` file |
| AI output persistence | Backend required reads plus `02-entity-schema/05-ai-persistence-patterns.md` after AI output schema is known |

Do not load all references preemptively.

## Tool Flow

Backend contract:

```text
get_current_schema -> apply_schema_patch -> sync_schema_artifacts -> read .howone/database/manifest.json
```

AI contract:

```text
get_current_ai_capabilities -> apply_capability_patch -> sync_ai_artifacts -> external-ai-capability
-> wait for terminal result -> sync_ai_artifacts -> read .howone/ai/manifest.json
```

No contract dry-run step. Normal generation applies one well-formed patch directly. For destructive,
narrowing, or public-access-expanding changes, stop for user alignment first, then apply the exact
approved patch.

SDK/code:

```text
read synced manifests -> update src/lib/sdk.ts -> implement UI/server code using src/lib/sdk.ts imports
```

## Source Of Truth

- Backend fields/access/indexes: `{appRoot}/.howone/database/manifest.json` after sync.
- AI names/workflow IDs/schemas: `{appRoot}/.howone/ai/manifest.json` after sync.
- App runtime entry: `{appRoot}/src/lib/sdk.ts`.
- Do not handwrite `.howone/` metadata.
- Do not infer contract identifiers from prompts, memory, or dependency source.

## Track Index

### Architect

| File | Use |
|---|---|
| `01-architect/01-app-generation.md` | Scope classification, platform boundary, ordering |
| `01-architect/02-manifest-codegen.md` | Synced manifests to `src/lib/sdk.ts` |

### Backend

| File | Use |
|---|---|
| `02-entity-schema/01-schema-design.md` | Entity fields, access, indexes |
| `02-entity-schema/02-schema-operations.md` | Patch/apply/sync/version rules |
| `02-entity-schema/03-access-models.md` | Backend authenticated/public access models |
| `02-entity-schema/04-query-contracts.md` | Backend filter/sort/pagination/index contracts |
| `02-entity-schema/05-ai-persistence-patterns.md` | Saving AI results into entities |

### AI

| File | Use |
|---|---|
| `03-ai-capabilities/01-ai-capability-architecture.md` | AI layers and design order |
| `03-ai-capabilities/02-workflow-contract-rules.md` | Capability JSON schema rules |
| `03-ai-capabilities/03-service-capability-catalog.md` | Supported workflow families |
| `03-ai-capabilities/04-workflow-operations.md` | External workflow create/update/status |
| `03-ai-capabilities/05-ai-feature-playbooks.md` | Reusable AI product patterns |

### SDK

| File | Use |
|---|---|
| `04-app-sdk/01-client-setup.md` | `createClient`, env, provider |
| `04-app-sdk/02-entity-operations.md` | `howone.entities` and public namespace |
| `04-app-sdk/03-auth.md` | Login/session/custom auth |
| `04-app-sdk/04-react-integration.md` | Provider and hooks |
| `04-app-sdk/05-file-upload.md` | Upload URLs/files |
| `04-app-sdk/06-raw-http.md` | Typed escape hatch |
| `04-app-sdk/07-ai-action-calls.md` | `howone.ai.*` runtime calls |
| `04-app-sdk/08-ai-manifest-handoff.md` | AI manifest to SDK bindings |
| `04-app-sdk/09-extension-boundaries.md` | Adapter/extension boundaries |
| `04-app-sdk/10-workflow-execute-sse.md` | Workflow run/stream wire format |
| `04-app-sdk/11-entity-data-access-patterns.md` | App entity access calls from synced manifest |
| `04-app-sdk/12-query-dsl-and-responses.md` | App query/filter/sort/pagination calls |

## Hard Rules

- Backend and AI design references must not include SDK implementation work.
- SDK references must not invent backend or AI contracts; they consume synced manifests.
- AI workflows must not perform database CRUD; persistence is app code through entities.
- Explicit user-owned integrations are app code, not a platform gap.
- Platform gap means missing HowOne contract/tool/catalog support, not an unsupported technology name.
