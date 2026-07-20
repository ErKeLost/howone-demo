# Service Capability Catalog

Use this reference **only** for HowOne **workflow-service AI** feasibility. It lists what the current
workflow service supports—not everything a full product may use.

Explicit user-owned integrations are outside this catalog per
`01-architect/01-app-generation.md`. Use that exception only when the user explicitly asks to
connect something outside HowOne. Ordinary generated AI app requests should be checked against this
catalog first.

Source: `docs/ai-capability.md`.

## Quick Selection Table

| User asks for | Use capability family | Typical inputs | Typical outputs |
|---|---|---|---|
| Latest info, research, source-backed answer | Web search / crawling | `topic`, `prompt`, `url`, `search_level` | `answer`, `sources`, `page_content` |
| Generate artwork/photo/logo/mockup | Image generation | `image_description`, `style_preference`, optional references | `generated_image_url` |
| Edit an image | Image editing | `source_image_url`, `edit_instruction` | `edited_image_url` |
| OCR or visual analysis | Image analysis / OCR | `image_urls`, `analysis_prompt` | `analysis_result` or `extracted_text` |
| Generate short video | Video generation | `video_prompt`, aspect/duration/frame URLs | `video_url` |
| Join clips / extract frames | Video editing | `video_urls` or `video_url` | `video_url` or `image_url` |
| Text to speech | Audio generation | `text_to_generate`, `language`, `voice_hint` | `audio_url` |
| Speech to text | Audio recognition | `source_audio_url`, `language` | `transcript_text`, optional `utterances` |
| Merge audio | Audio merging | `audio_urls` | `merged_audio_url` |
| Stock/index history | Financial data retrieval | `trading_symbol`, `unit`, `start`, `end` | `price_history` |
| Literature search/citations | Academic research | `query` | `papers`, `bibtex` |
| Save generated file | File storage | `file_type`, `content` | `file_url` |

If the requested behavior is not in this table or the detailed sections below, do not invent it.

## Web Search And Crawling

Use for latest information, news, market context, source-backed answers, web page extraction.

Inputs:

- `prompt`: query or detailed research instruction;
- `search_level`: `low`, `medium`, or `high`; default to medium;
- `offset`: pagination for low-level search;
- page crawl input should be a URL.

Outputs:

- synthesized answer or raw search result;
- `sources` array of URLs;
- crawled page text/markdown when crawling.

Rules:

- Use web search when the user asks for current/latest information.
- Use page crawling when the product needs content from a specific URL.
- Do not use search as an outbound API caller.
- Include source links in output when the product promises research.

## Image Generation

Use for new images from prompts or prompt + reference URLs.

Inputs:

- `image_description`: detailed prompt;
- `style_preference`: optional;
- `reference_image_urls`: optional URL array;
- size/format options only when product exposes them.

Outputs:

- `generated_image_url` or `image_urls`;
- avoid metadata unless product needs it.

Rules:

- One image per request is usually more reliable.
- Do not put resolution text into the prompt when a size parameter exists.
- Reference images must be URLs and should be described by position/content.
- Subject to moderation; do not promise forbidden content.

## Image Editing

Use for modifying existing images.

Inputs:

- `source_image_url` or `source_image_urls`;
- `edit_instruction`;
- optional output size/format.

Outputs:

- `edited_image_url`.

Supported edits include resize/crop/rotate, background removal/replacement, object removal/addition,
style transfer, enhancement, merge/composite, lighting/color changes.

Rules:

- At least one image URL is required.
- Keep edit instructions focused.
- For complex multi-step edits, describe the final desired result.

## Image Analysis And OCR

Use for visual understanding, image comparison, text extraction, quality review.

Inputs:

- `image_urls`;
- `analysis_prompt` or `ocr_instruction`.

Outputs:

- `analysis_result` for semantic analysis;
- `extracted_text` for OCR.

Rules:

- Ask for the exact information needed.
- Do not include confidence/bounding boxes unless user asks.
- OCR quality depends on image quality.

## Video Generation

Use for short video clips from text or image frames.

Inputs:

- `video_prompt`;
- optional `first_frame_url`, `last_frame_url`, `reference_image_urls`;
- optional `aspect_ratio`, `duration`, `negative_prompt`, `generate_audio`.

Outputs:

- `video_url`.

Rules:

- Keep individual clips short, generally 5-10 seconds.
- For consistency, generate/use a first-frame image.
- For longer videos, generate clips and concatenate via video editing.
- Audio in video works best with one speaker per clip.

## Video Editing

Use for concatenating clips or extracting first/last frames.

Inputs:

- concatenate: `video_urls` with at least two URLs;
- frame extraction: `source_video_url`.

Outputs:

- `merged_video_url` or `frame_image_url`.

Rules:

- Inputs must be accessible URLs.
- Best results when clips share resolution/aspect ratio.

## Audio Generation

Use for text-to-speech.

Inputs:

- `text_to_generate`;
- `language` or `languages`;
- `gender`;
- `audio_hint`;
- optional output format/name.

Outputs:

- `audio_url`.

Rules:

- Single speaker per call.
- For dialogue, generate each speaker line and merge audio.
- `audio_hint` should describe voice in English.

## Audio Recognition

Use for speech-to-text.

Inputs:

- `source_audio_url`;
- optional `language`;
- optional speaker diarization setting.

Outputs:

- `transcript_text`;
- optional `utterances` when speaker info is requested.

Rules:

- Audio must be URL-accessible.
- Silent or low-quality audio can produce empty/poor transcript.

## Financial Data Retrieval

Use for historical stock/index price data.

Inputs:

- `trading_symbol`;
- `unit`: `daily` or `minute`;
- `start`;
- `end`.

Outputs:

- `price_history` array;
- `trading_symbol`;
- optional warning.

Rules:

- Historical data only; no real-time streaming.
- Indices usually support daily data only.
- Ask for exact tickers when possible.
- Does not provide fundamentals, earnings, or live news unless combined with web search.

## Academic Research

Use for literature search, paper metadata, BibTeX.

Inputs:

- `query`.

Outputs:

- `papers`;
- `bibtex` when citation output is requested.

Rules:

- Search quality depends on query specificity.
- Availability varies by academic source.
- PDF assets should be handled as URLs.

## File Storage

Use when workflow needs to save generated content into a file.

Inputs:

- `file_type`: `json`, `yaml`, `csv`, `pdf`, `md`, or `txt`;
- `content`: string content to save.

Outputs:

- `file_url`.

Rules:

- Structured content must be serialized to string before saving.
- Do not use file storage as a database.
- If app needs records/history, persist file URL through entities.

## Composition Patterns

| Pattern | Workflow design |
|---|---|
| Image -> Video | generate first-frame image, pass as `first_frame_url` to video generation |
| Multi-clip video | generate short clips, concatenate via video editing |
| Dialogue audio | generate each speaker line, merge audio |
| Search -> Report | web search/crawl, synthesize structured report, optionally save file |
| Video -> Image edit -> Video | extract frame, edit frame, use as next reference |
| RAG document chat | indexing workflow + query workflow |

## Platform AI stop (catalog boundary)

Stop **platform AI design** (do not invent capabilities) when the requirement:

- has no matching capability family in this catalog or detailed sections below;
- needs behavior the workflow service cannot perform per contract rules in `02-workflow-contract-rules.md`;
- violates workflow input/output constraints (e.g. persistence or app CRUD inside the workflow contract);
- exceeds documented service limits after you read the relevant section.

Explain the gap by **missing catalog/contract support**, not by naming the user's stack. Offer the
closest listed capability or ask to narrow the product ask. App-owned integrations remain allowed in parallel.
