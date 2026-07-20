# AGENTS.md

This is a standard HowOne Vite app.

Read this file once when entering the project, follow it during implementation, and do not reread it unless it changes or the current task genuinely requires checking project rules again.

## Project Defaults

- Package manager: `bun`
- Common commands: `bun run dev`, `bun run typecheck`, `bun run build`
- The scaffold normally installs dependencies during `howone init app`. If `node_modules` is missing, run `bun install` before validation instead of treating missing binaries as code failures.
- Default stack: React, Vite, TypeScript, Tailwind CSS, shadcn/ui-style components, `@howone/sdk`

## Source of Truth

Use project-local sources in this order:

1. Synced HowOne manifests under `.howone/`
2. Generated SDK bindings such as `src/lib/sdk.ts`
3. The smallest directly relevant app files
4. Package/config metadata
5. Dependency source only when a concrete mismatch or missing detail remains

Do not guess generated entity names, AI action names, schemas, workflow IDs, or auth behavior when a synced manifest exists.

## Context Discipline

Start with the smallest useful context:

1. Read the smallest file that directly controls the requested behavior.
2. Prefer manifests, config, and public library APIs before local library internals.
3. Expand only when implementation, validation, or a concrete ambiguity requires it.

For ordinary page or feature work:

- Start with the relevant route, page, feature component, or entry file.
- Read additional local files only when they directly control the behavior being changed or resolve a specific uncertainty.
- If a manifest, config file, or validation error answers the question, prefer that over widening the file search.

## Trusted Libraries

Treat common public libraries as known dependencies during ordinary feature work:

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- lucide-react
- Radix UI
- clsx
- class-variance-authority

Do not inspect `src/components/ui/*` or other library-style source files just to rediscover standard APIs.

Using or importing a standard UI primitive is not by itself a reason to read its local source. For ordinary feature work, use the public component name and existing import path first.

Read local component or library-style source only when:

- validation fails
- imports cannot be resolved from package/config metadata
- the API is genuinely unclear
- the task edits that component
- the project has custom wrappers, variants, or unusual exports
- the user explicitly asks to follow local component conventions

Prefer failure-driven inspection over speculative context loading.

## HowOne Runtime and Auth

- Use synced HowOne manifests plus `src/lib/sdk.ts` as the source of truth for generated entity and AI bindings.
- Use the `howone` skill: `skill(howone)` → `SKILL.md` → `01-architect/01-app-generation.md` → smallest track reads from the skill index. Scope follows the user request.
- Tracks: `01-architect/`, `02-entity-schema/`, `03-ai-capabilities/`, `04-app-sdk/` — include only what the user needs.
- Choose auth posture from the schema access contract, not from guesswork:
  - authenticated/private app data uses `howone.entities.*`; the backend derives ownership from the JWT
  - public pages use `howone.public.entities.*` only when the manifest explicitly allows public access
- For private authenticated features, use the app-level HowOne auth flow instead of inventing unauthenticated fallback data paths.
- Do not pass owner fields such as `created_by_id`, `created_by_user_id`, `ownerId`, or `puid` into authenticated entity queries or writes.

## Validation

After meaningful code changes:

1. If dependencies are unavailable, run `bun install` first.
2. Run the narrowest relevant validation, usually `bun run typecheck`.
3. Run `bun run build` when the change affects app wiring, SDK integration, routes, or production bundling.
4. If validation fails, inspect the smallest failing surface before widening context.
