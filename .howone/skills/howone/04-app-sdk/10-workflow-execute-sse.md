# Workflow Execute SSE

Use this reference for `@howone/sdk` AI action streaming and raw workflow execution calls.

## Endpoint Contract

The SDK uses the current workflow execute SSE endpoint:

| Method | Path |
|---|---|
| `POST` | `/workflow/execute/{project_short_id}/{config_id}` |

The request body is:

```json
{
  "inputs": {},
  "priority": "normal"
}
```

`priority` is optional. All requests require `Authorization: Bearer <JWT>`.

The successful HTTP response includes:

| Header | Meaning |
|---|---|
| `Content-Type: text/event-stream` | Streaming response |
| `X-Run-Id` | Execution task id for status/cancel follow-up |

Do not use or generate code for old endpoints such as
`/workflow/{appId}/{workflowId}/execute_sse`.

## Wire Format

Frames contain only a `data:` line and a blank line:

```text
data: {"id":"evt_8ae6d6e8a4ea","event":"run_start","message":"execution with sse is started"}

data: {"id":"evt_241ff985450b","event":"progress","message":"[DISPLAY] Executing node: Extract"}

data: {"id":"evt_f3a1b2c3d4e5","event":"run_complete","message":{"video_url":"https://..."}}
```

There are no separate SSE `event:` or `id:` lines. The JSON envelope owns those fields.

## Envelope

```ts
type WorkflowSseEnvelope = {
  id: string
  event: 'run_start' | 'progress' | 'run_complete' | 'run_error' | 'credit_insufficient'
  message: string | Record<string, unknown>
}
```

Event meanings:

| Event | Message | Meaning |
|---|---|---|
| `run_start` | string | Stream opened and execution started. |
| `progress` | string | One worker log line. `[DISPLAY]` lines are intended for UI. |
| `run_complete` | object | Final workflow-specific output. SDK maps this to `AiResult.finalResult`. |
| `run_error` | string | Workflow failed. |
| `credit_insufficient` | string | Billing/credit block. |

The terminal event is exactly one of `run_complete`, `run_error`, or `credit_insufficient`.
There is no `stream_end` event.

## SDK Mapping

`howone.ai.run(configId, inputs)` and typed action `.run()` call the endpoint above.

`AiResult` maps the stream as:

```ts
type AiResult = {
  success: boolean
  runId?: string
  outcome: 'success' | 'credit_insufficient' | 'run_error' | null
  finalResult: Record<string, unknown> | null
  progressLogs: string[]
  errors: string[]
  events: AiEvent[]
}
```

For typed actions with an `outputSchema`, `.run()` returns the validated `run_complete.message`
object directly.

## Callback Rules

- `onRunStart(event)` receives the `run_start` envelope.
- `onMessageChunk(text, event)` receives each `progress.message` line.
- `onProgress(0, message)` receives each progress line; `onProgress(100)` fires on success.
- `onRunComplete(event, result)` receives `event.message` as the final object.
- `onRunError(event)` receives `event.message` as the error string.
- `onCreditInsufficient(event)` receives `event.message` as the credit error string.
- `onEvent(event, 'workflow')` fires for every parsed envelope.

Do not write UI code that expects `event.payload.result`, `event.payload.details.reason`,
`node_start`, `tool_call_end`, `state_update`, or `ai_message_chunk`. Those belong to an old
multi-channel protocol and are not part of the current workflow execute SSE contract.

