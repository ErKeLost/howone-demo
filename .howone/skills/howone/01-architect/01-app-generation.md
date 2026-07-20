# App Generation Architect

Read immediately after `skill(name="howone")` and before platform design tools, SDK contract
edits, or implementation guesses.

HowOne is a generated app platform. This file classifies **user scope**, separates **platform
contracts** from explicit user-owned integrations, and routes to backend, AI, or SDK tracks. Keep design
tracks separate: backend design does not require SDK references; AI design does not require SDK
references until the synced AI manifest is ready for code.

## Scope classification

Map the user request to surfaces. Include only what they need.

| Need | Tracks | Notes |
|---|---|---|
| Unclear or full product scope | `01-architect/` (+ others as discovered) | Finish this file before other tracks |
| Persisted app data on HowOne | `02-entity-schema/` → sync | Skip SDK until app code needs calls |
| HowOne AI features | `03-ai-capabilities/` → sync → external workflow | Verify catalog before design |
| SDK wiring, auth, UI calls | `04-app-sdk/` | Only after manifests exist when contracts apply |
| UI only, no HowOne data/AI | App code under `{appRoot}` | No schema/AI design tools |
| Explicit user-owned integrations | App code + config | Only when the user explicitly asks to connect something outside HowOne |

**Mixed scope:** read at least one file per touched track (`SKILL.md` index) before writing.

## HowOne platform boundary

Use this decision model for **any** user request. Ask whether the ask is a **platform contract
surface** or an explicit user-owned integration.

### Platform provides (evidence required)

| Surface | Evidence to check | Design track |
|---|---|---|
| Persisted structured data on HowOne | Schema tools + `{appRoot}/.howone/database/manifest.json` | `02-entity-schema/` |
| AI execution on HowOne workflow service | `03-service-capability-catalog.md` + AI manifest + AI tools | `03-ai-capabilities/` |
| App calls HowOne runtime | Synced manifests + `04-app-sdk/` reference for that behavior | `04-app-sdk/` |
| Mutating platform contracts | `backend-api-design`, `ai-capability-design`, sync tools, `external-ai-capability` | Per surface |

If none of these surfaces can express the user's **platform** requirement after checking contracts,
catalog, and tool schemas, it is a **platform gap**—not an automatic ban on whatever technology the
user named.

### Explicit user-owned integration (not platform gap)

Use this path only when the user explicitly asks to connect something they run, host, or configure
outside HowOne contracts. Do not apply it to ordinary generated app requests such as "AI image
generation app", "AI story app", "login", "cloud sync", or "history"; first check the HowOne
platform tracks.

- Implement in application code and configuration under `{appRoot}`.
- **Do not refuse** because HowOne does not provision it.
- **Do not** call platform design tools to fake it as entities, AI capabilities, or manifest fields.
- **Do not** tell the user they cannot use their own stack—only clarify it is outside HowOne platform scope when they explicitly asked for that stack.

### Boundary decision (always)

```text
1. What did the user ask for?
2. Does it require HowOne persisted data? → entity-schema path or skip
3. Does it require HowOne AI? → catalog + ai-capabilities path or skip
4. Did they explicitly ask to connect something outside HowOne? → app-owned; wire in UI/config
5. Did they ask for a platform feature with no contract evidence? → platform stop (generic)
6. Mixed? → platform parts via tracks; explicit integrations in app code
```

### Platform scope rules

- **No invented platform APIs:** Only fields and behaviors present in manifests, catalog, tools, or documented SDK references.
- **No invalid shortcuts:** Do not handwrite `.howone/` metadata or guess version/workflow identifiers.
- **Stop wording:** Name the **missing contract surface** (e.g. no catalog family, no manifest binding, no tool operation)—not the user's technology choice.

When stopping a platform path, separate what HowOne can provide from any explicit integration the
user requested.

Inspect-only platform reads do not replace this file before the first **design write**.

## Platform layers

| Layer | Source of truth | App responsibility |
|---|---|---|
| Database | `{appRoot}/.howone/database/manifest.json` | Entity binding handoff |
| AI | `{appRoot}/.howone/ai/manifest.json` + workflow status | AI binding handoff |
| SDK | `@howone/sdk` + `{appRoot}/src/lib/sdk.ts` | App runtime calls |
| Frontend | App code | UI, state, feedback |

Validated/synced manifests drive code—not prompts or memory.

```text
user request → scope → platform contracts → sync → sdk binding → UI
```

When SDK work is in scope, import the app runtime from `src/lib/sdk.ts`; do not guess entity/action
names or platform URLs.

## Minimum track reads (after this file)

Use `SKILL.md` for the full file index. Typical minimums:

| Surface in scope | Read at least |
|---|---|
| Entity/schema design | `02-entity-schema/01-schema-design.md`, `02-entity-schema/02-schema-operations.md` |
| Backend query/public contracts | add `02-entity-schema/03-access-models.md`, `02-entity-schema/04-query-contracts.md` |
| App entity query code | add `04-app-sdk/11-entity-data-access-patterns.md`, `04-app-sdk/12-query-dsl-and-responses.md` after manifest sync |
| AI design | `03-ai-capabilities/01-ai-capability-architecture.md`, `03-ai-capabilities/03-service-capability-catalog.md`, `03-ai-capabilities/02-workflow-contract-rules.md` |
| AI + saved outputs | add `02-entity-schema/05-ai-persistence-patterns.md` after AI contract is known |
| Bindings after sync | `02-manifest-codegen.md` + relevant `04-app-sdk/` files |

## Data posture

Choose before schema and UI.

| Product need | Access posture | Runtime handoff |
|---|---|---|
| Per-user private data | authenticated own | SDK entity track later |
| Shared authenticated data | authenticated all | SDK entity track later |
| Public catalog | public list where safe | SDK public entity track later |
| Public share/detail | public scoped | SDK public entity track later |
| Anonymous create | public create scoped/any | SDK public entity track later |
| AI run history | authenticated own | private history entity |
| AI public share | private + public scoped entities | two entities |

Defaults: "my/private" → own; public catalog only when fields are safe; share links → scoped + limits.

## Auth posture

| Need | Client | Provider |
|---|---|---|
| Hosted HowOne login | default `createClient` | hosted |
| Custom login UI | `auth: 'custom'`, provider `auth="none"` | app UI |
| External IdP | headless + adapter | adapter owns token |
| No auth | `auth: 'none'` | — |

Keep default HowOne brand control unless user asks to hide. Resolve identity through the SDK track
when app code depends on the current user.

## Entity workflow (when `02-entity-schema/` in scope)

1. Read schema design + operations references.
2. Inspect current schema/manifest.
3. Design full entity contract (fields, access, indexes).
4. Apply one complete patch → `sync_schema_artifacts`.
5. Read `{appRoot}/.howone/database/manifest.json`.
6. Stop backend design. Read SDK references only if implementing app calls.

No schema dry-run step. High-risk changes (delete entity/field, broaden public write, required
without default) need explicit user alignment before applying the final patch.

## AI workflow (when `03-ai-capabilities/` in scope)

1. Read architecture + **catalog** (feasibility) + contract rules; use playbooks when they match.
2. Apply one complete capability patch → `sync_ai_artifacts`.
3. External workflow create/update per workflow-operations reference; keep job/request IDs from tool results.
4. Wait for the terminal result. A successful update promotes its new workflow ID in the backend capability version.
5. Run `sync_ai_artifacts` again, then read `{appRoot}/.howone/ai/manifest.json`.
6. Stop AI design. Read SDK references only if implementing app calls.
7. If persistence required: entity workflow after output contract is fixed.

Do not fake catalog-backed AI. Platform gap → stop AI design path, explain generically.
No AI capability dry-run step. Design the contract from the skill references, then apply the final
capability patch.

## Scope patterns (not a product catalog)

| Pattern | Platform work |
|---|---|
| Ephemeral AI result in UI state only | AI + SDK; skip entity-schema unless user adds storage |
| AI with history/library | AI contract first, then persistence entity |
| Public view of private AI output | private entity + scoped public entity |
| Behavior-only AI change | workflow update when schemas unchanged |
| Schema/UI drift | schema → sync → SDK → then UI |

## Checklist before implementation

- [ ] Scope explicit: which tracks apply; explicit integration vs platform clear
- [ ] Data and auth posture chosen when data in scope
- [ ] AI requirements verified against catalog when AI in scope
- [ ] Manifests synced before SDK codegen
- [ ] `src/lib/sdk.ts` is the HowOne entrypoint
- [ ] UI owns visible feedback; no invented platform APIs
