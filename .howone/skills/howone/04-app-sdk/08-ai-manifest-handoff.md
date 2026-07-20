# AI Manifest Handoff (App SDK)

Use this reference after AI capability artifacts have been synced and app code must call the
workflow through `@howone/sdk`.

This file answers: **how does `.howone/ai/manifest.json` become `src/lib/sdk.ts`, and how should UI
call it?**

For live stream wire details, read `04-app-sdk/10-workflow-execute-sse.md`. The current endpoint emits
only `run_start`, `progress`, `run_complete`, `run_error`, and `credit_insufficient`.

## Binding Source

Generate `src/lib/sdk.ts` from `.howone/ai/manifest.json`. Do not write AI bindings from memory,
from the original prompt, or from the workflow service response.

For each manifest capability/action:

1. Read stable action name/ID.
2. Read `workflowId`.
3. Read `inputSchema`.
4. Read `outputSchema`.
5. Generate Zod input and output schemas.
6. Bind with `defineAiAction(name, { workflowId, inputSchema, outputSchema })`.
7. Compose with `withAiActions(client, ai)`.

`workflowId` is mandatory. Without it, the SDK falls back to the action name as the execution URL
segment, and the workflow service will reject it because the segment is not a UUID.

## Generated Binding Example

```ts
import {
  createClient,
  defineAiAction,
  defineAiActions,
  withAiActions,
} from '@howone/sdk'
import { z } from 'zod'

const client = createClient({
  projectId: import.meta.env.VITE_HOWONE_PROJECT_ID,
  env: import.meta.env.VITE_HOWONE_ENV,
})

export const summarizeDocumentInputSchema = z.object({
  document_url: z.string().url(),
  summary_length: z.string().optional(),
})
export type SummarizeDocumentInput = z.infer<typeof summarizeDocumentInputSchema>

export const summarizeDocumentOutputSchema = z.object({
  summary: z.string(),
})
export type SummarizeDocumentOutput = z.infer<typeof summarizeDocumentOutputSchema>

export const ai = defineAiActions({
  summarizeDocument: defineAiAction('summarizeDocument', {
    workflowId: '550e8400-e29b-41d4-a716-446655440000',
    inputSchema: summarizeDocumentInputSchema,
    outputSchema: summarizeDocumentOutputSchema,
  }),
})

const howone = withAiActions(client, ai)
export default howone
```

## JSON Schema To Zod

| JSON Schema | Zod |
|---|---|
| `string` | `z.string()` |
| `string` + `format: "uri"` | `z.string().url()` |
| `number` | `z.number()` |
| `integer` | `z.number().int()` |
| `boolean` | `z.boolean()` |
| `array` of strings | `z.array(z.string())` |
| `array` of objects | `z.array(z.object({ ... }))` |
| `object` | `z.object({ ... })` |
| string enum | `z.enum([...])` |
| field not in `required` | `.optional()` |
| nullable | `.nullable()` |

Rules:

- Required manifest fields must stay required in Zod.
- Do not add `.passthrough()` to hide execution envelope problems.
- Do not make outputs optional to silence validation failures.
- If the workflow returns a different shape, fix the workflow/capability contract.

## Calling Actions

For typed one-shot actions:

```ts
const output = await howone.ai.summarizeDocument.run({
  document_url,
  summary_length: 'short',
})

setSummary(output.summary)
```

When `outputSchema` exists, `.run()` returns the validated `finalResult` payload directly.

Do not read:

```ts
result.finalResult.summary
result.data.summary
result.raw.finalResult
```

Those are execution-envelope paths, not the typed SDK action contract.

## Streaming And Events

Use `.stream()` when UI needs live output or cancellation:

```ts
const session = howone.ai.generateStory.stream(input, {
  onMessageChunk: (line) => appendLog(line),
  onProgress: (percent, line) => {
    if (line?.startsWith('[DISPLAY]')) setStatus(line.replace('[DISPLAY]', '').trim())
    if (percent === 100) setProgress(100)
  },
  onCreditInsufficient: (event) => showCreditError(event.message),
  onRunError: (event) => showExecutionError(event.message),
  onError: (error) => setError(error.message),
  onComplete: (result) => setRawResult(result),
})

cancelButton.onclick = () => session.cancel()
const final = await session.result
```

Use `.events()` when code wants an async iterable:

```ts
for await (const event of howone.ai.generateStory.events(input)) {
  if (event.type === 'progress') {
    appendLog(String(event.message))
  }
  if (event.type === 'run_complete') {
    setFinalResult(event.message)
  }
  if (event.type === 'credit_insufficient') {
    showCreditError(String(event.message))
  }
  if (event.type === 'run_error') {
    showExecutionError(String(event.message))
  }
}
```

## UI State

The SDK returns data and exposes callbacks. The app owns all visible UI.

Recommended states:

```ts
type AiUiState<T> =
  | { status: 'idle' }
  | { status: 'running'; progress?: number }
  | { status: 'succeeded'; output: T }
  | { status: 'failed'; message: string }
  | { status: 'cancelled' }
```

Do not add or import SDK toast APIs. Do not show SDK-owned overlays.

## Persistence Handoff

If AI output should survive refresh, use entity persistence after the action returns.

For history-style products, prefer `runAiActionAndPersist()`:

```ts
const result = await runAiActionAndPersist({
  entity: howone.entities.Generation,
  input: { prompt },
  createPending: (input) => ({
    prompt: input.prompt,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  }),
  run: (input) => howone.ai.generateImage.run(input),
  mapCompleted: ({ output }) => ({
    status: 'completed',
    resultUrl: output.generated_image_url,
    completedAt: new Date().toISOString(),
  }),
  mapFailed: ({ error }) => ({
    status: 'failed',
    errorMessage: error instanceof Error ? error.message : 'Generation failed',
  }),
})
```

For simple save-after-success:

```ts
const output = await howone.ai.summarizeDocument.run(input)
await howone.entities.DocumentSummary.create({
  documentUrl: input.document_url,
  summary: output.summary,
  status: 'completed',
})
```

Do not ask the workflow to write records. Do not pass owner fields for authenticated own entities.

## Workflow Edit Handoff

When changing external workflow behavior later:

1. If schema changes, update AI capability contract first and sync manifest.
2. Submit update through `external-ai-capability` with `updates: [{ capabilityName, updatePrompt }]`.
3. Re-read `.howone/ai/manifest.json`; update may rotate `workflowId` to a fresh config UUID.
4. Regenerate SDK bindings whenever the manifest `workflowId`, input schema, or output schema changed.
5. Behavior-only updates still require checking the manifest before deciding SDK is unchanged.

The SDK does not use old `workflowConfigID` status values. It binds to the current manifest
`workflowId`, which is the EAX config id used in execution URLs.

## Handoff Checklist

- `.howone/ai/manifest.json` exists and is current.
- Each action has `workflowId`.
- Zod input/output schemas match manifest required fields.
- `defineAiAction` uses action name + exact workflow UUID.
- UI uses returned typed output, not raw execution envelope.
- Streaming session is cancellable when UI exposes cancel.
- Persistence goes through `howone.entities.*`.
- Visible status/error UI is app-owned.
