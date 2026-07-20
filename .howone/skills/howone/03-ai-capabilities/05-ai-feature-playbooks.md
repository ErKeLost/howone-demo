# AI Feature Playbooks

Use this reference when turning a user request into concrete HowOne AI capabilities and optional
persistence entities. App-side SDK calls belong to `04-app-sdk/`.

## Playbook: Document Summary

Use when user uploads or links a document and wants a summary.

Capability:

```json
{
  "name": "summarizeDocument",
  "description": "Reads an uploaded document and produces a concise summary highlighting the key points.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "document_url": {
        "type": "string",
        "format": "uri",
        "description": "Supabase Storage URL of the uploaded document."
      },
      "summary_length": {
        "type": "string",
        "description": "Desired summary length, e.g. short, medium, long, or a specific sentence count."
      }
    },
    "required": ["document_url"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": {
        "type": "string",
        "description": "Summary in the same language as the source document."
      }
    },
    "required": ["summary"]
  },
  "outputEntityName": "DocumentSummary"
}
```

Persistence:

- private `DocumentSummary` if user history is needed;
- fields: `documentUrl`, `summary`, `status`, `errorMessage`, `requestedAt`, `completedAt`.

App implementation handoff: after sync and external workflow submit, read the SDK track before
writing app-side AI runtime calls.

## Playbook: Image Generator

Use for prompt-to-image products.

Capability:

```json
{
  "name": "generateImage",
  "description": "Generates an image based on a natural language description provided by the user.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image_description": {
        "type": "string",
        "description": "Detailed description of the image to generate, including subject, style, mood, and composition."
      },
      "style_preference": {
        "type": "string",
        "description": "Optional style preference such as watercolor, photorealistic, anime, or flat design."
      }
    },
    "required": ["image_description"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "generated_image_url": {
        "type": "string",
        "format": "uri",
        "description": "Public URL of the generated image."
      }
    },
    "required": ["generated_image_url"]
  },
  "outputEntityName": "GeneratedImage"
}
```

Persistence:

- use `Generation` for private history;
- public share requires separate `SharedGeneration`.

App implementation handoff: if persistence is needed, finish the entity contract first, then read
the SDK track for runtime action calls and persistence helper usage.

## Playbook: Image Editor

Use when user uploads/selects an image and describes edits.

Inputs:

- `source_image_url`;
- `edit_instruction`.

Output:

- `edited_image_url`.

Rules:

- app uploads source file first;
- workflow receives URL only;
- keep edit instruction focused;
- persist both original and edited URLs if history matters.

## Playbook: News/Research Briefing

Use for latest info or source-backed research.

Inputs:

- `topic`;
- optional `language`;
- optional `depth` as loose string, not strict enum unless UI really has fixed modes.

Output:

- structured `briefing` object with `summary` and `sources`.

Rules:

- use web search/crawling capability;
- include source URLs;
- output descriptions must specify language;
- if user asks for latest/current, this workflow must retrieve data internally.

## Playbook: Stock Analysis

Use for historical price analysis.

Inputs:

- `trading_symbol`;
- `start`;
- `end`;
- `unit`: daily/minute when UI exposes it.

Output:

- `analysis`;
- optional `price_history` only if app renders chart from workflow output.

Rules:

- do not ask user for CSV unless they explicitly have data;
- historical only, no real-time streaming;
- combine with web search only if user asks for news/context.

## Playbook: Academic Literature Review

Use for paper search and bibliography.

Inputs:

- `query`;
- optional `language` for synthesized review;
- optional `citation_style`.

Outputs:

- `papers`;
- `review_summary`;
- `bibtex` if citations are needed.

Rules:

- do not promise full PDF availability;
- keep paper metadata fields useful and minimal;
- use source URLs/DOIs when returned.

## Playbook: Audio Transcription

Use for speech-to-text.

Inputs:

- `source_audio_url`;
- optional `language`;
- optional `with_speaker_info`.

Outputs:

- `transcript_text`;
- optional `utterances`.

Rules:

- app uploads audio first;
- workflow receives URL;
- if speaker diarization is not required, do not add utterances.

## Playbook: Text To Speech

Use for generating spoken audio from text.

Inputs:

- `text_to_generate`;
- `language`;
- optional `gender`;
- optional `audio_hint`.

Output:

- `audio_url`.

Rules:

- single speaker per call;
- dialogue should generate multiple clips and merge;
- persist audio URL through entity if user needs library/history.

## Playbook: Video Generator

Use for short video creation.

Inputs:

- `video_prompt`;
- optional `first_frame_url`;
- optional `aspect_ratio`;
- optional `duration`.

Output:

- `video_url`.

Rules:

- keep one clip short;
- for longer output, compose multiple clips and concatenate;
- first-frame image helps consistency.

## RAG Playbook

Use only when app needs question answering over user/project documents.

Workflows:

1. `indexDocuments`
   - input: document URLs or collection reference;
   - output: indexing result/status.
2. `queryKnowledgeBase`
   - input: question + knowledge base reference;
   - output: answer + sources.

Rules:

- RAG is the only standard two-workflow exception.
- Do not re-index on every question.
- Persist document/index status in entities if app needs history or dashboard.

## Feature Design Checklist

- Choose one playbook or clearly combine compatible playbooks.
- Verify capability exists in `03-service-capability-catalog.md`.
- Use URL inputs for files/media.
- Keep outputs minimal and product-facing.
- Decide persistence separately.
- Generate SDK bindings only after manifest sync and external workflow submit.
- Use app-owned UI for progress/errors.
