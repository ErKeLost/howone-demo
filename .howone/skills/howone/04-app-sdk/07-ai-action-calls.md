# AI Actions

## Manifest Contract — Read This First

**`src/lib/sdk.ts` must be generated from `.howone/ai/manifest.json`. Do not write it from memory or from generic examples.**

For AI capability and workflow design, read `03-ai-capabilities/` first. This file is only for app-side SDK
bindings and runtime calls after the manifest exists.

For every capability in `manifest.json`:
1. Read `name`, `workflowId`, `inputSchema`, `outputSchema`
2. Generate a zod schema from `inputSchema.properties`
3. Generate a zod schema from `outputSchema.properties` when an output schema exists
4. Call `defineAiAction(name, { workflowId, inputSchema, outputSchema })` — **`workflowId` is mandatory**

Without `workflowId`, the SDK falls back to using the action name as the URL segment. Action names are not UUIDs — the EAX server will reject the call with "invalid input syntax for type uuid".

Do not mark required manifest output fields as `.optional()` to silence validation. Do not add
`.passthrough()` as a workaround for execution envelopes. A typed `run()` validates and returns the
workflow `finalResult` payload, not the raw execution envelope.

## When to Write SDK Bindings

**Do NOT write `defineAiAction` until `.howone/ai/manifest.json` contains the workflowId for the capability and the external workflow implementation has been submitted/confirmed by the workflow layer.**

Correct sequence:
1. `ai-capability-design` — design the capability contract
2. `sync_ai_artifacts` — sync manifest to disk
3. `external-ai-capability` — submit workflow create/update to EAX from the synced manifest
4. Re-read `.howone/ai/manifest.json`; update may have rotated `workflowId`
5. Write `src/lib/sdk.ts` with the current manifest `workflowId`

Building without errors does **not** mean the AI workflow binding is correct. A missing `workflowId` causes a runtime UUID error at the EAX execution call.

---

## Core Concepts

- `defineAiAction(id, config)` declares a typed AI action from a workflow ID.
- `defineAiActions({ ... })` groups multiple action definitions.
- `withAiActions(client, actions)` binds them onto the composed client as `howone.ai.*`.
- Each bound action exposes `.run()`, `.stream()`, and `.events()`.
- Input/output are validated at runtime using zod schemas.

---

## Type System

### AiActionConfig

```ts
type AiActionConfig<TInput, TOutput> = {
  workflowId: string                 // REQUIRED — UUID from manifest.json. Without this, SDK uses action name as URL segment (not a UUID → EAX rejects).
  inputSchema?: z.ZodType<TInput>    // validates input before calling the workflow
  outputSchema?: z.ZodType<TOutput>  // validates the workflow finalResult payload for run()
  mode?: 'run' | 'stream' | 'events' // default: supports all three modes
}
```

### AiResult (ExecutionResult)

```ts
type AiResult = {
  success: boolean
  runId?: string
  /** Terminal outcome of the run */
  outcome: 'success' | 'credit_insufficient' | 'run_error' | null
  finalResult: Record<string, unknown> | null  // run_complete.message
  progressLogs: string[]                       // progress.message lines
  totalDuration: number
  errors: string[]
  events: AiEvent[]
}
```

### AiSession (for stream)

```ts
type AiSession = {
  result: Promise<AiResult>   // resolves when the stream completes
  cancel: () => void          // abort the request (safe to call multiple times)
  signal: AbortSignal
}
```

### AiEvent (SSE events)

All workflow execute SSE events use the current envelope shape:

```ts
type AiEvent = {
  id: string
  type: 'run_start' | 'progress' | 'run_complete' | 'run_error' | 'credit_insufficient'
  event: AiEvent['type']
  message: string | Record<string, unknown>
  payload?: Record<string, unknown> // present for run_complete as a compatibility alias of message
}
```

Stream terminates after exactly one of: `run_complete`, `credit_insufficient`, or `run_error`.
For the full wire protocol, read `04-app-sdk/10-workflow-execute-sse.md`.

---

## Defining AI Actions

### Basic action — always include workflowId from manifest.json

```ts
import { defineAiAction, defineAiActions } from '@howone/sdk'
import { z } from 'zod'

// Source: .howone/ai/manifest.json → capabilities[0].inputSchema.properties
export const generateStoryInputSchema = z.object({
  topic: z.string().min(1),
  ageRange: z.enum(['3-5', '6-8', '9-12']),
  language: z.string().default('en'),
})
export type GenerateStoryInput = z.infer<typeof generateStoryInputSchema>

// workflowId from .howone/ai/manifest.json → capabilities[0].workflowId
export const ai = defineAiActions({
  generateStory: defineAiAction('generateStory', {
    workflowId: 'd69ab648-2c00-4d94-928e-01bd7b2a5bb2', // ← from manifest.json
    inputSchema: generateStoryInputSchema,
  }),
})
```

### Action with typed output

```ts
export const generateStoryOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
  summary: z.string(),
})
export type GenerateStoryOutput = z.infer<typeof generateStoryOutputSchema>

export const ai = defineAiActions({
  generateStory: defineAiAction('generateStory', {
    workflowId: 'd69ab648-2c00-4d94-928e-01bd7b2a5bb2', // ← from manifest.json
    inputSchema: generateStoryInputSchema,
    outputSchema: generateStoryOutputSchema,
  }),
})
```

### Multiple actions — each must have its own workflowId from manifest.json

```ts
// Each workflowId is the UUID from .howone/ai/manifest.json for that capability
export const ai = defineAiActions({
  generateStory: defineAiAction('generateStory', {
    workflowId: 'd69ab648-2c00-4d94-928e-01bd7b2a5bb2',
    inputSchema: z.object({ topic: z.string(), language: z.string() }),
  }),
  translateText: defineAiAction('translateText', {
    workflowId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    inputSchema: z.object({ text: z.string(), targetLang: z.string() }),
  }),
  summarizeArticle: defineAiAction('summarizeArticle', {
    workflowId: 'f9e8d7c6-b5a4-3210-fedc-ba9876543210',
    inputSchema: z.object({ url: z.string().url(), maxWords: z.number().int().optional() }),
  }),
  analyzeImage: defineAiAction('analyzeImage', {
    workflowId: '11223344-5566-7788-99aa-bbccddeeff00',
    inputSchema: z.object({ imageUrl: z.string().url(), prompt: z.string().optional() }),
  }),
})
```

> **Note**: The UUIDs above are placeholders. Always copy the exact value from `.howone/ai/manifest.json`.

---

## Calling AI Actions

### run() — typed action result

```ts
import howone, { type GenerateStoryInput, type GenerateStoryOutput } from '@/lib/sdk'

async function generateStory(input: GenerateStoryInput) {
  const output = await howone.ai.generateStory.run(input)
  // output is GenerateStoryOutput when outputSchema is configured.
  return output
}
```

When an action has `outputSchema`, `run()` returns the validated workflow `finalResult` payload.
When an action omits `outputSchema`, `run()` returns the raw `AiResult` execution envelope.

### run() — with SSE callbacks

```ts
const result = await howone.ai.generateStory.run(input, {
  onMessageChunk: (line) => {
    appendLog(line)
  },
  onProgress: (percent, line) => {
    if (line?.startsWith('[DISPLAY]')) setStatus(line.replace('[DISPLAY]', '').trim())
    if (percent === 100) setProgress(100)
  },
  onError: (error) => {
    console.error('SSE error:', error)
  },
})
```

UI feedback belongs in the frontend app. Do not import or expect SDK toast APIs. Use returned
promises and callbacks to update app-owned state:

```ts
setStatus({ type: 'loading', message: 'Generating story...' })

try {
  const output = await howone.ai.generateStory.run(input, {
    onProgress: (progress) => setProgress(progress),
  })
  setStatus({ type: 'success', message: 'Story ready', output })
} catch (error) {
  setStatus({
    type: 'error',
    message: error instanceof Error ? error.message : 'Story generation failed',
  })
}
```

### stream() — start and control a session

```ts
function startStream(input: GenerateStoryInput) {
  const session = howone.ai.generateStory.stream(input, {
    onMessageChunk: (text) => {
      setOutput(prev => prev + text)
    },
    onComplete: (result) => {
      console.log('Done:', result.finalResult)
    },
    onError: (error) => {
      console.error('Error:', error)
    },
  })

  // session.result is a Promise<AiResult>
  // session.cancel() aborts the stream
  return session
}

// Cancel mid-stream
const session = startStream(myInput)
setTimeout(() => session.cancel(), 5000)

// Or await the full result via the session
const result = await session.result
```

### events() — async iterable SSE events

```ts
async function consumeEvents(input: GenerateStoryInput) {
  for await (const event of howone.ai.generateStory.events(input)) {
    switch (event.type) {
      case 'run_start':
        setStatus('running')
        break
      case 'progress':
        appendLog(String(event.message))
        break
      case 'run_complete':
        console.log('Final result:', event.message)
        break
      case 'credit_insufficient':
        showCreditError(String(event.message))
        break
      case 'run_error':
        showExecutionError(String(event.message))
        break
    }
  }
}
```

---

## zod Schema Patterns

### JSON Schema → zod mapping

Generate zod from `.howone/ai/manifest.json` inputSchema / outputSchema fields:

| JSON Schema type | zod |
|---|---|
| `string` | `z.string()` |
| `number` | `z.number()` |
| `integer` | `z.number().int()` |
| `boolean` | `z.boolean()` |
| `array of string` | `z.array(z.string())` |
| `array of object` | `z.array(z.object({ ... }))` |
| `object` | `z.object({ ... })` |
| `enum` (string) | `z.enum(['a', 'b', 'c'])` |
| optional field (not in `required[]`) | `.optional()` on the field |
| field with default | `.default(value)` |
| nullable field | `.nullable()` |

### Real examples

```ts
// Simple text generation
export const summarizeInputSchema = z.object({
  text: z.string().min(1).max(10000),
  maxWords: z.number().int().min(10).max(500).optional(),
  language: z.string().default('en'),
})

// Image analysis
export const analyzeImageInputSchema = z.object({
  imageUrl: z.string().url(),
  prompt: z.string().optional(),
  outputFormat: z.enum(['json', 'text', 'markdown']).default('json'),
})

// Multi-step generation with options
export const generatePostInputSchema = z.object({
  topic: z.string().min(1),
  tone: z.enum(['professional', 'casual', 'humorous']),
  platform: z.enum(['twitter', 'linkedin', 'blog']),
  keywords: z.array(z.string()).min(1).max(10),
  includeHashtags: z.boolean().default(true),
})

// Nested object
export const analyzeDataInputSchema = z.object({
  dataset: z.array(
    z.object({
      id: z.string(),
      value: z.number(),
      label: z.string().optional(),
    })
  ),
  aggregationType: z.enum(['sum', 'average', 'median', 'max', 'min']),
  groupBy: z.string().optional(),
})
```

---

## SSEExecutionOptions — All Callbacks

```ts
type SSEExecutionOptions = {
  // Called for every parsed workflow envelope. channel is always "workflow".
  onEvent?: (event: AiEvent, channel: string) => void

  // Lifecycle
  onRunStart?: (event: RunStartEvent) => void
  onRunComplete?: (event: RunCompleteEvent, result: AiResult) => void
  /** Credits / quota exhausted — show top-up UI, NOT a generic error */
  onCreditInsufficient?: (event: CreditInsufficientEvent) => void
  /** Workflow logic failed — show retry/support UI */
  onRunError?: (event: RunErrorEvent) => void

  // Progress log lines from progress.message
  onMessageChunk?: (text: string, event: ProgressEvent) => void

  // Progress compatibility callback: progress lines fire as (0, message), success fires as (100)
  onProgress?: (percent: number, message?: string) => void

  // Internal transport log
  onLog?: (message: string) => void

  // Called on any error (credit or execution)
  onError?: (error: Error) => void

  // Called when the stream closes (success or error)
  onComplete?: (result: AiResult) => void

  // Abort signal — connect to an AbortController for cancellation
  signal?: AbortSignal

  // Limit-exceeded handler (overrides client-level config)
  limitExceeded?: {
    onLimitExceeded?: (context: LimitExceededContext) => void
    showUpgradeToast?: boolean
    upgradeUrl?: string
  }
}
```

> The current workflow execute SSE endpoint does not emit `node_start`, `tool_call_end`,
> `state_update`, or `ai_message_chunk`. Do not write generated app code that expects those events.
> `onCreditInsufficient` and `onRunError` are **mutually exclusive** terminal events.
> Do not use a generic `onError` to distinguish them — use the dedicated callbacks.

---

## AiSchemaValidationError

Thrown by `run()` when input or output schema validation fails.

```ts
import { AiSchemaValidationError } from '@howone/sdk'

try {
  const result = await howone.ai.generateStory.run(input)
} catch (err) {
  if (err instanceof AiSchemaValidationError) {
    console.error('Validation failed:')
    console.error('  Action:', err.actionId)          // 'generateStory'
    console.error('  Direction:', err.direction)       // 'input' | 'output'
    console.error('  Issues:', err.issues)             // [{ path, message, code }]
  }
}
```

---

## AI Result Persistence

When AI-generated content should be saved to an entity, prefer the SDK persistence helper for
history-style products. It standardizes the pending-first pattern from `02-entity-schema/05-ai-persistence-patterns.md`
without adding UI behavior.

```ts
import { runAiActionAndPersist } from '@howone/sdk'

const result = await runAiActionAndPersist({
  entity: howone.entities.Generation,
  input: {
    prompt: 'Dragons and magic',
    ageRange: '6-8',
  },
  createPending: (input) => ({
    prompt: input.prompt,
    ageRange: input.ageRange,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  }),
  run: (input) => howone.ai.generateStory.run(input),
  mapCompleted: ({ output }) => ({
    status: 'completed',
    title: output.title,
    content: output.content,
    completedAt: new Date().toISOString(),
  }),
  mapFailed: ({ error }) => ({
    status: 'failed',
    errorMessage: error instanceof Error ? error.message : 'Generation failed',
  }),
  onStateChange: (state) => {
    // app-owned UI callback; SDK does not show toasts
    setGenerationState(state.status)
  },
})
```

Return shape:

```ts
type AiPersistenceResult<TRecord, TOutput> =
  | { status: 'completed'; record: TRecord; output: TOutput }
  | { status: 'failed'; record: TRecord; error: unknown }
```

Rules:

- `createPending` must only return fields declared in the entity schema.
- `mapCompleted` maps durable product fields from AI output to entity update payload.
- `mapFailed` should persist a failure state if the product shows history or retry.
- Use `onStateChange` to update app-owned UI; do not add SDK toast behavior.
- For simple one-shot AI actions that do not need history, call `howone.ai.*.run()` directly.

---

## React Patterns

### One-shot run with loading state

```tsx
import { useState } from 'react'
import { AiSchemaValidationError } from '@howone/sdk'
import howone, { type GenerateStoryInput, type GenerateStoryOutput } from '@/lib/sdk'

function GenerateStoryButton({ input }: { input: GenerateStoryInput }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateStoryOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const output = await howone.ai.generateStory.run(input)
      setResult(output)
    } catch (err) {
      if (err instanceof AiSchemaValidationError) {
        setError(`Validation error: ${err.issues.map(i => i.message).join(', ')}`)
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Story'}
      </button>
      {result && <div>{result.title}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}
```

### Streaming with live text output

```tsx
import { useRef, useState } from 'react'
import howone, { type GenerateStoryInput } from '@/lib/sdk'
import type { AiSession } from '@howone/sdk'

function StreamingStoryGenerator({ input }: { input: GenerateStoryInput }) {
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const sessionRef = useRef<AiSession | null>(null)

  function startGeneration() {
    setText('')
    setStreaming(true)

    sessionRef.current = howone.ai.generateStory.stream(input, {
      onStreamChunk: (chunk) => setText(prev => prev + chunk),
      onComplete: () => setStreaming(false),
      onError: (err) => {
        console.error(err)
        setStreaming(false)
      },
    })
  }

  function cancelGeneration() {
    sessionRef.current?.cancel()
    setStreaming(false)
  }

  return (
    <>
      <button onClick={startGeneration} disabled={streaming}>Start</button>
      <button onClick={cancelGeneration} disabled={!streaming}>Cancel</button>
      <pre>{text}</pre>
    </>
  )
}
```

---

## Common Mistakes

| Mistake | Correct Pattern |
|---|---|
| `defineAiAction('generateStory', { inputSchema })` — no `workflowId` | Always include `workflowId` from `manifest.json`; SDK falls back to action name, which is not a UUID → EAX rejects |
| Writing `src/lib/sdk.ts` before `.howone/ai/manifest.json` has a workflowId | Run `ai-capability-design` → `sync_ai_artifacts` → `external-ai-capability`; only write bindings from the synced manifest |
| Hardcoding `workflowId` from memory or guessing | Always read from `.howone/ai/manifest.json` — copy the exact UUID |
| `howone.ai.run.generateStory(input)` | `howone.ai.generateStory.run(input)` |
| Action named `run`, `stream`, or `events` | Rename to e.g. `executeWorkflow`, `streamContent` |
| Passing raw JSON Schema from manifest into `defineAiAction` | Convert JSON Schema fields to Zod first |
| Making every output field `.optional()` or adding `.passthrough()` after validation fails | Keep manifest-required output fields required; inspect `AiSchemaValidationError.issues` and fix the contract/workflow mismatch |
| Reading `raw.finalResult`, `raw.data.result`, or `raw.result` after a typed `.run()` | Use the returned value directly when `outputSchema` is configured |
| Calling `howone.ai.generateStory.run(input)` inside JSX render | Move to event handler or useEffect |
