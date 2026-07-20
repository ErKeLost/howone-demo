# AI Capability Architecture

**Track:** `03-ai-capabilities/` — capability/workflow **design** only; SDK calls live in `04-app-sdk/`.

Use this reference when the user needs HowOne platform AI (verify `03-service-capability-catalog.md` first).

This file answers: **what AI layer should be designed, in what order, and where each responsibility
belongs?** For schema details read `02-workflow-contract-rules.md`. For workflow service calls read
`04-workflow-operations.md`.

## Platform Mental Model

HowOne AI has five distinct layers:

| Layer | Owns | Does not own |
|---|---|---|
| Product feature | User-facing goal, UX states, persistence decision | workflow internals |
| AI capability contract | `name`, `description`, `inputSchema`, `outputSchema`, `outputEntityName`, versions, manifest | database CRUD, UI, auth |
| External workflow implementation | generated/edited workflow graph behind a manifest `workflowId`/EAX `config_id` | app schema, frontend state |
| Status/background layer | job/task polling, completed/failed state, submitted config mapping | SDK binding source |
| SDK handoff | synced manifest action names, workflow IDs, input/output schemas | workflow generation |

Do not collapse these layers. The common mistakes are:

- putting database writes into the workflow;
- generating `src/lib/sdk.ts` before `.howone/ai/manifest.json` is synced;
- using action names instead of workflow UUIDs;
- treating workflow `outputSchema` as a database schema;
- faking unsupported AI with static frontend data.

## Source Of Truth

```text
user request                         = intent
agent AI contract proposal           = draft
applied AI capability version        = validated contract
.howone/ai/manifest.json             = local synced source for workflow submit and later SDK codegen
external-ai-capability submission    = job/task/config mapping; update IDs remain pending
terminal background finalizer        = promotes successful update IDs in the backend capability version
SDK/UI implementation                = separate app-sdk track after AI design is complete
entity schema                        = persistence contract, separate from AI contract
```

Never generate SDK bindings from the user prompt or from an unsynced draft.

## Standard AI Feature Flow

Use this flow for new AI features:

1. Classify the feature using `03-ai-capabilities/03-service-capability-catalog.md`.
2. Decide whether the feature is supported. If not supported, stop and explain the missing capability.
3. Decide one workflow per user-facing feature. Use two workflows only for RAG.
4. Design `inputSchema` and `outputSchema` using `02-workflow-contract-rules.md`.
5. Apply the AI capability patch through the capability tool.
6. Sync `.howone/ai/manifest.json`.
7. Submit workflow create/update through `external-ai-capability` from the synced manifest.
8. Store returned job/task IDs and submitted config IDs for polling/debugging.
9. Let the host poll status until `completed` or `failed`.
10. On success, the background finalizer promotes successful update IDs in the backend capability version. Failed operations keep their previous IDs.
11. Run `sync_ai_artifacts` again, then re-read `.howone/ai/manifest.json`.
12. Leave AI design. If app code must call the workflow, read the SDK track and generate bindings.
13. If output must persist, design entity schema after the output contract is fixed.

Do not submit external workflow create/update from a hand-written schema. It should come from the
synced manifest.

## New Feature vs Existing Feature

| Situation | Correct path |
|---|---|
| New AI feature, no manifest entry | create AI capability, sync manifest, submit workflow create |
| Manifest entry exists but no workflow created yet | submit workflow create from manifest |
| User asks to change input/output contract | update capability contract first, sync, then submit workflow update |
| User asks to improve behavior only | submit workflow update with `updates[]` and `updatePrompt` |
| User asks to save outputs/history | design/update database entity after AI output contract is known |
| User asks for public share of AI result | private history entity + public scoped share entity |

## Create vs Update

Create external workflow when:

- capability has a `workflowId`;
- no confirmed external implementation exists;
- the manifest `workflowId` has not already been submitted as an implementation config.

Update external workflow when:

- an external implementation exists;
- you have a concrete `updatePrompt`.
- `external-ai-capability` can read the current manifest `workflowId`.

Current `external-ai-capability` semantics:

```text
create:
  config_id = manifest capability.workflowId
  mode      = create

update:
  previous config = current manifest capability.workflowId
  new config      = freshly generated UUID
  submitted state = local manifest remains unchanged while EAX runs
  completed state = backend capability version receives the fresh UUID
```

The SDK execution binding uses the synced manifest `workflowId`, which is the EAX config id. After
update completion, run `sync_ai_artifacts`; only the newly synced manifest value should be copied
into `src/lib/sdk.ts`.
Do not invent IDs; let the AI design/sync/external workflow tools generate and persist them.

## Workflow Count Rule

Default: one user-facing AI feature equals one workflow.

Examples:

| Feature | Workflow count | Why |
|---|---:|---|
| Generate illustrated story | 1 | story text + images are one product action |
| Edit uploaded photo | 1 | one input image + edit prompt -> edited image |
| Research news briefing | 1 | search + synthesis are one action |
| Generate video from prompt | 1 | media generation is one action |
| Chat with uploaded documents | 2 | RAG needs indexing + query workflows |

Do not split normal multi-step behavior into separate workflows. The workflow service handles
internal orchestration.

## Persistence Boundary

AI workflows produce outputs. They do not own product records.

Workflow may do:

- generate, summarize, translate, classify, extract;
- search/crawl and synthesize;
- generate/edit/analyze images, video, and audio;
- retrieve financial or academic data;
- save/read generated files through URL-based storage.

Workflow must not do:

- database create/read/update/delete;
- authentication/session logic;
- file upload from browser raw bytes;
- payment processing;
- owner assignment or permissions;
- app navigation, UI state, toast, or modal logic.

If the product needs durable history, design entity persistence outside the workflow:

```text
workflow input.prompt    -> Generation.prompt
workflow output.imageUrl -> Generation.resultUrl
runtime failure          -> Generation.errorMessage
runtime status           -> Generation.status
```

After AI and database manifests are synced, app implementation can read the SDK track to wire the
runtime calls.

## Unsupported AI Behavior

If a user explicitly requires behavior not available in the workflow service, stop that AI path.

Do not:

- fake AI with static templates;
- hide the unsupported part;
- build a UI that pretends the workflow exists;
- replace the requested capability with a different one without saying so;
- assume private APIs, external datasets, or providers that are not listed.

Correct response:

```text
This exact AI behavior needs <missing capability>. The current workflow service supports <closest
available capability>. I can build <narrow supported version>, or we need platform support for
<missing capability> first.
```

## Capability Naming

Use stable JavaScript-safe IDs:

```text
generateIllustration
summarizeDocument
researchNewsBriefing
editProductPhoto
transcribeAudio
```

Avoid:

- display labels with spaces;
- names that collide with base methods: `run`, `stream`, `events`;
- provider names: `openAiImage`, `geminiAnalyze`;
- implementation names: `searchThenSummarize`.

The description can be human readable. The ID must be stable for codegen.

## AI Architecture Checklist

Before editing files:

- Feature maps to available workflow capabilities.
- One workflow per feature unless RAG.
- Description says what the user gets, not how tools run.
- Input schema accepts URLs for files, not raw bytes.
- Output schema contains only requested result fields.
- Input and output property names do not overlap.
- Text output descriptions specify language behavior.
- Persistence is modeled as entity schema, not workflow CRUD.
- `workflowId` / EAX `config_id` values are generated by tools and not guessed.
- SDK binding will be generated only after manifest sync.
