# Workflow Contract Rules

Use this reference when designing `capability.description`, `inputSchema`, `outputSchema`, and
`outputEntityName` for HowOne AI workflows.

These rules come from `docs/ai-worlfow-guide-schema.md`. Violating them can make the workflow
service reject the request or produce a workflow the runtime cannot execute reliably.

## Contract Shape

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
        "description": "The generated summary in the same language as the source document."
      }
    },
    "required": ["summary"]
  },
  "outputEntityName": "DocumentSummary"
}
```

## Loose JSON Schema

The workflow engine is agentic. Overly strict schemas reduce reliability.

Do:

- require only essential inputs;
- make non-essential options optional;
- use strings with good descriptions for open-ended user choices;
- use nested objects only when the product truly needs structured output;
- use `format: "uri"` for URLs.

Avoid:

- `minLength`, `maxLength`, `pattern` unless technically required;
- enum for open-ended values like tone, style, audience, mood;
- many required knobs that normal users do not understand;
- provider/model/tool names in schema fields.

Good:

```json
{
  "tone": {
    "type": "string",
    "description": "Desired writing tone, e.g. formal, casual, humorous, empathetic, professional."
  }
}
```

Bad:

```json
{
  "tone": {
    "type": "string",
    "enum": ["formal", "casual", "humorous"],
    "minLength": 3,
    "maxLength": 20
  }
}
```

Use enum only for closed domains such as `"daily" | "minute"` or known output modes.

## URLs Only For Files

All file exchange uses cloud storage URLs.

Correct inputs:

```json
{
  "source_image_url": {
    "type": "string",
    "format": "uri",
    "description": "Public URL of the source image to edit."
  }
}
```

Correct outputs:

```json
{
  "edited_image_url": {
    "type": "string",
    "format": "uri",
    "description": "Public URL of the edited image."
  }
}
```

Forbidden:

- raw `File` / `Blob`;
- base64 content;
- `contentEncoding`;
- inline PDF/image/audio bytes;
- browser upload logic in workflow.

The app uploads first, then passes the resulting URL to the workflow. File upload helpers belong to
the SDK track.

## Output Minimalism

Every output field costs model attention. Only include what the product will render or persist.

Usually forbidden unless explicitly requested:

- `processing_time`, `timestamp`, `created_at`;
- `model_used`, `provider`, `version`;
- `file_size`, `mime_type`, `resolution`, `frame_rate`;
- `confidence_score`, `bounding_boxes`, `coordinates`;
- style/color/tone metadata when user only asked for an asset.

Examples:

| User asks | Good output | Avoid |
|---|---|---|
| Summarize a PDF | `summary` | `summary`, `word_count`, `reading_time` |
| Generate image | `generated_image_url` | `generated_image_url`, `model_used`, `color_palette` |
| OCR image | `extracted_text` | `extracted_text`, `confidence_score`, `bounding_boxes` |
| Generate video | `video_url` | `video_url`, `duration_seconds`, `frame_rate` |

If the app needs history metadata, put it in the entity schema, not workflow output.

## Input / Output Names Must Not Overlap

Input and output property names share a routing namespace. Do not reuse names.

| Scenario | Bad | Good |
|---|---|---|
| Translation | input `text`, output `text` | input `source_text`, output `translated_text` |
| Summary | input `content`, output `content` | input `source_content`, output `summary` |
| Image edit | input `image_url`, output `image_url` | input `source_image_url`, output `edited_image_url` |
| Audio transcript | input `audio_url`, output `audio_url` | input `source_audio_url`, output `transcript_text` |

## Description Says What, Not How

`capability.description` describes the user-visible outcome.

Good:

```json
"description": "Searches the web for recent news on a topic and produces a structured briefing with source links."
```

Bad:

```json
"description": "First calls search_web, then summarizes articles with an LLM, then saves the result."
```

Do not mention:

- internal tool names;
- step sequences;
- model/provider names;
- database writes;
- storage implementation details except URL inputs/outputs.

## Output Language Must Be Explicit

Every text output field description must say what language to use.

Patterns:

```json
"summary": {
  "type": "string",
  "description": "Summary in the same language as the source document."
}
```

```json
"translated_text": {
  "type": "string",
  "description": "Translated text in the target language specified by 'target_language'."
}
```

```json
"briefing": {
  "type": "string",
  "description": "Briefing written in the language specified by 'language'."
}
```

Do not write vague descriptions like `"The translated text."`

## No CRUD In Workflow

Workflow belongs to intelligent processing. App persistence belongs to entities.

Forbidden in capability descriptions and schemas:

- "save to database";
- "create user record";
- "update task status";
- "delete previous result";
- "read current user's records";
- "assign owner".

Instead:

1. workflow returns output fields;
2. app code persists through the entity runtime after SDK handoff;
3. durable fields map to the entity contract.

## External Data Assumptions

Do not require user-provided datasets unless the user said they have them.

| User asks | Bad input | Better input |
|---|---|---|
| Stock analysis app | `stock_data_csv_url` | `trading_symbol`, `start_date`, `end_date` |
| Latest news app | `article_urls` | `topic`, `language` |
| Academic research | `paper_pdf_urls` | `query`, optional `year_range` |
| Product comparison | `product_dataset_url` | `product_names` or `search_topic` |

The workflow should use available retrieval/search capabilities when data is external.

## Raw JSON Requirement

Schemas must be raw JSON objects:

- start with `{` and end with `}`;
- ASCII double quotes;
- no trailing commas;
- no `undefined`, `NaN`, comments, or single quotes;
- not a string containing escaped JSON.

Good:

```json
{ "type": "object", "properties": {} }
```

Bad:

```json
"{ \"type\": \"object\" }"
```

## Schema Pattern Templates

### Text generation

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "Topic to write about."
      },
      "audience": {
        "type": "string",
        "description": "Intended audience, e.g. executives, children, developers, or general readers."
      },
      "language": {
        "type": "string",
        "description": "Output language, e.g. English or Chinese."
      }
    },
    "required": ["topic"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "generated_text": {
        "type": "string",
        "description": "Generated text in the language specified by 'language', or English if not specified."
      }
    },
    "required": ["generated_text"]
  }
}
```

### Image generation

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "image_description": {
        "type": "string",
        "description": "Detailed description of the image to generate, including subject, style, mood, and composition."
      },
      "style_preference": {
        "type": "string",
        "description": "Optional style preference such as watercolor, pixel art, photorealistic, anime, or flat design."
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
  }
}
```

### Image editing

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "source_image_url": {
        "type": "string",
        "format": "uri",
        "description": "Public URL of the image to edit."
      },
      "edit_instruction": {
        "type": "string",
        "description": "Natural language instruction describing the desired edit."
      }
    },
    "required": ["source_image_url", "edit_instruction"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "edited_image_url": {
        "type": "string",
        "format": "uri",
        "description": "Public URL of the edited image."
      }
    },
    "required": ["edited_image_url"]
  }
}
```

### Research briefing

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "Research topic or question."
      },
      "language": {
        "type": "string",
        "description": "Language for the output briefing."
      }
    },
    "required": ["topic"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "briefing": {
        "type": "object",
        "description": "Structured briefing written in the language specified by 'language'.",
        "properties": {
          "summary": { "type": "string" },
          "sources": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": { "type": "string" },
                "url": { "type": "string", "format": "uri" },
                "key_point": { "type": "string" }
              }
            }
          }
        },
        "required": ["summary", "sources"]
      }
    },
    "required": ["briefing"]
  }
}
```

## Contract Checklist

- Required inputs are essential only.
- File inputs/outputs are URL strings.
- Output contains only the requested product result.
- Input/output property names do not overlap.
- Text output descriptions specify language.
- Description says what, not how.
- No CRUD/auth/upload/payment/app-state requirements.
- Feature fits an available capability.
- Schema is raw valid JSON.
