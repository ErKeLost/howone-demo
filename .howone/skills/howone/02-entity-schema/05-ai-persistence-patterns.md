# AI Persistence Entity Patterns

Use this reference after the AI output schema is known and the product needs durable data:
generation history, saved results, reports, retryable jobs, share pages, or user libraries.

This is a backend entity design reference. It does not define SDK calls. App-side execution and
persistence code belongs in `04-app-sdk/07-ai-action-calls.md` and
`04-app-sdk/08-ai-manifest-handoff.md`.

## Core Boundary

```text
AI capability outputSchema != database entity schema
```

The AI output schema is the workflow return contract. The database entity schema is the product
record contract. Persist only fields the product needs after refresh, across sessions, in lists, or
on public pages.

For every AI output field, decide:

| Question | Persist? | Entity design |
|---|---:|---|
| User must see it after refresh | yes | explicit field |
| It appears in history/library/search | yes | field + index if queried |
| It is needed for retry/resume | yes | input/options/status fields |
| It is only a streaming/intermediate chunk | no | runtime/UI state |
| It is provider debug metadata | usually no | logs, not product records |
| It is sensitive internal/provider data | usually no | omit or keep private-only |

## Pending-First Record Model

For long-running or user-visible AI jobs, design an entity that can represent pending, completed,
and failed states. The app may create a pending record before workflow execution, then update it
after completion or failure.

Required contract pieces:

- original user input or durable input reference;
- `status`;
- output fields for completed display;
- failure fields for history/retry;
- timestamps for list ordering and stale-job handling.

Status field:

```json
{
  "status": {
    "type": "string",
    "description": "pending | running | completed | failed | canceled",
    "default": "pending"
  }
}
```

Rules:

- Do not infer completion only from `resultUrl`, `summary`, or another output field.
- Keep failed records when the product has history or retry UX.
- If pending/running records are shown from persisted data, define how stale records are recovered.
- Do not store raw event streams unless the entity explicitly needs them.

## Minimal Generation History Entity

Use for image, text, report, music, video, or similar generation history.

```json
{
  "name": "Generation",
  "type": "object",
  "properties": {
    "prompt": { "type": "string" },
    "status": { "type": "string", "default": "pending" },
    "resultUrl": { "type": ["string", "null"], "default": null },
    "resultText": { "type": ["string", "null"], "default": null },
    "errorMessage": { "type": ["string", "null"], "default": null },
    "requestedAt": { "type": "date" },
    "completedAt": { "type": ["date", "null"], "default": null }
  },
  "required": ["prompt", "status", "requestedAt"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  },
  "indexes": [
    { "name": "owner_updated", "fields": ["updatedDate"], "scope": "owner" },
    { "name": "owner_status_updated", "fields": ["status", "updatedDate"], "scope": "owner" }
  ],
  "performance": {
    "defaultLimit": 20,
    "maxLimit": 100,
    "allowedSorts": ["updatedDate", "requestedAt"]
  },
  "presentation": {
    "titleField": "prompt",
    "subtitleField": "status"
  }
}
```

Prefer separate product fields over one opaque `result` object when the UI lists, filters, previews,
or shares the output. Use an object field only for genuinely nested product-level structured data.

## Structured Analysis Report Entity

Use when AI returns a report users browse later.

```json
{
  "name": "AnalysisReport",
  "type": "object",
  "properties": {
    "sourceTitle": { "type": "string" },
    "sourceUrl": { "type": ["string", "null"], "default": null },
    "status": { "type": "string", "default": "pending" },
    "summary": { "type": ["string", "null"], "default": null },
    "insights": { "type": "array", "default": [] },
    "score": { "type": ["number", "null"], "default": null },
    "errorMessage": { "type": ["string", "null"], "default": null },
    "requestedAt": { "type": "date" },
    "completedAt": { "type": ["date", "null"], "default": null }
  },
  "required": ["sourceTitle", "status", "requestedAt"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": { "read": "none", "create": "none", "update": "none", "delete": "none" }
  },
  "indexes": [
    { "name": "owner_updated", "fields": ["updatedDate"], "scope": "owner" },
    { "name": "owner_score_updated", "fields": ["score", "updatedDate"], "scope": "owner" }
  ]
}
```

Mapping rule:

```text
workflow input.sourceTitle -> AnalysisReport.sourceTitle
workflow input.sourceUrl   -> AnalysisReport.sourceUrl
workflow output.summary    -> AnalysisReport.summary
workflow output.insights   -> AnalysisReport.insights
workflow output.score      -> AnalysisReport.score
runtime failure            -> AnalysisReport.errorMessage
runtime completed          -> AnalysisReport.completedAt
```

Do not save the whole workflow envelope unless the product explicitly needs a private object field
for audit/debug.

## Public Share Split

For public AI result pages, split private history from public share data:

- private `Generation` stores prompts, failures, drafts, internal metadata, and user history;
- public/scoped `SharedGeneration` stores only curated fields for anonymous viewing.

Scoped public share entity:

```json
{
  "name": "SharedGeneration",
  "type": "object",
  "properties": {
    "shareId": {
      "type": "string",
      "autoGenerate": { "strategy": "uuid" }
    },
    "title": { "type": "string" },
    "resultUrl": { "type": "string" },
    "active": { "type": "boolean", "default": true },
    "sourceGenerationId": { "type": "string" }
  },
  "required": ["shareId", "title", "resultUrl", "active", "sourceGenerationId"],
  "access": {
    "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
    "public": {
      "read": "scoped",
      "create": "none",
      "update": "none",
      "delete": "none",
      "requiredScopes": ["shareId"],
      "allowedFilters": ["shareId", "active"],
      "allowedSorts": ["updatedDate"],
      "defaultLimit": 1,
      "maxLimit": 1
    }
  },
  "indexes": [
    { "name": "share_id_unique", "fields": ["shareId"], "unique": true },
    { "name": "owner_updated", "fields": ["updatedDate"], "scope": "owner" }
  ]
}
```

Never make the main private generation history public just to support share pages.

## Retry And Resume Fields

If retry is part of the product, persist enough input fields to rebuild the workflow request:

- prompt/source content reference;
- selected style/mode/options;
- uploaded file URLs or file IDs;
- status and error message;
- requested/completed timestamps.

Do not persist:

- auth/session/token values;
- raw uploaded browser bytes;
- temporary component state;
- raw streaming chunks;
- provider secrets;
- hidden system prompts or internal prompts.

Prefer a new retry record for history-oriented products. Prefer updating the same record only when
retry semantically replaces the original attempt.

## Field Mapping Checklist

Before app implementation, write the mapping explicitly:

```text
workflow input.prompt       -> Generation.prompt
workflow input.style        -> Generation.style
workflow output.imageUrl    -> Generation.resultUrl
workflow output.caption     -> Generation.resultText
workflow error.message      -> Generation.errorMessage
runtime request started     -> Generation.requestedAt
runtime request completed   -> Generation.completedAt
```

If a workflow output has no mapping, decide whether it is intentionally transient or the entity
schema is missing a product field.

## Access Checklist

| Product behavior | Entity access |
|---|---|
| User-only private generation history | authenticated own, public none |
| Shared authenticated library | authenticated all, public none |
| Anonymous public gallery | public list with safe fields only |
| One public share link | public scoped with share id |
| Public submission to AI queue | public create only with anti-abuse constraints |

## Persistence Checklist

- AI output schema is fixed before persistence schema design.
- Entity stores product fields, not workflow internals.
- Status and failure fields exist for long-running jobs.
- Retry/resume input fields are durable.
- Public share data is split from private history.
- Indexes match history/share/list query patterns.
- SDK implementation begins only after database and AI manifests are synced.
