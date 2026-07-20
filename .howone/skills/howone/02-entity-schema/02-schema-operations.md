# Schema Operations

Use this reference when calling `backend-api-design` to change HowOne backend entity contracts.
This is a backend design reference, not an app SDK guide.

## Source Of Truth

```text
current backend schema          = inspect result
backend-api-design apply result = validated contract version
sync_schema_artifacts output    = local .howone/database manifest
src/lib/sdk.ts                  = later SDK binding, handled by SDK track
```

Do not handwrite `.howone/database/*`. Sync from a backend version after apply.

## Normal Flow

For generated app work, avoid fake dry-runs. Build one correct patch and apply it.

```text
1. backend-api-design { type: "get_current_schema" }
2. Design one complete patch.operations[] for the feature.
3. backend-api-design { type: "apply_schema_patch", expectedVersionId, reason, patch }
4. sync_schema_artifacts with the returned versionId/currentVersionId.
5. Read .howone/database/manifest.json.
6. Stop backend design; SDK/UI work is a separate track.
```

There is no schema dry-run step. If a change is destructive, narrowing, or broadens public access,
stop and align with the user before applying the final patch.

## Patch Shape

```json
{
  "type": "apply_schema_patch",
  "expectedVersionId": "current-version-id-from-inspect",
  "reason": "Add personal todo storage",
  "patch": {
    "operations": [
      {
        "type": "create_entity",
        "entityName": "Todo",
        "payload": {
          "description": "Personal task item.",
          "visibility": "private",
          "type": "object",
          "properties": {
            "text": { "type": "string", "description": "Task text." },
            "completed": { "type": "boolean", "default": false }
          },
          "required": ["text"],
          "access": {
            "authenticated": { "read": "own", "create": "own", "update": "own", "delete": "own" },
            "public": { "read": "none", "create": "none", "update": "none" }
          },
          "indexes": [
            {
              "name": "completed_updated",
              "scope": "owner",
              "fields": ["completed", "updatedDate"],
              "order": { "updatedDate": "desc" }
            }
          ]
        }
      }
    ]
  }
}
```

Critical shape rules:

- `create_entity.payload.properties` is the field map. Do not use `payload.definition`.
- `create_entity.payload.required` is the required field array. Do not use `requiredFields`.
- `update_entity.payload` is the patch itself. Do not wrap it in `payload.patch`.
- Entity and field names must match `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- Backend-generated version IDs never go inside operation payloads.

## Operation Types

Patch operations accepted by `backend-api-design`:

```text
create_entity
update_entity
delete_entity
add_field
update_field
delete_field
set_field_required
unset_field_required
```

Inspect/version operations are top-level tool calls, not patch operations:

```text
get_current_schema
list_entities
get_entity
list_schema_versions
get_schema_version
restore_schema_version
diff_schema_versions
```

## Operation Payloads

### create_entity

Use when the entity does not exist.

```json
{
  "type": "create_entity",
  "entityName": "Article",
  "payload": {
    "description": "Published article.",
    "visibility": "public",
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "slug": { "type": "string" },
      "status": { "type": "string", "enum": ["draft", "published"], "default": "draft" },
      "publishedAt": { "type": ["date", "null"], "default": null }
    },
    "required": ["title", "slug"],
    "access": {
      "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
      "public": {
        "read": "list",
        "create": "none",
        "update": "none",
        "allowedFilters": ["slug", "status"],
        "allowedSorts": ["publishedAt", "updatedDate"],
        "defaultLimit": 20,
        "maxLimit": 100
      }
    }
  }
}
```

Rules:

- Include explicit `access.authenticated` and `access.public`.
- Required fields must exist in `properties`.
- Required fields with `default` or `autoGenerate` may be omitted by create callers.
- Do not include system fields such as `id`, `created_date`, `updated_date`, or owner IDs.

### update_entity

Use for entity metadata and contract sections.

```json
{
  "type": "update_entity",
  "entityName": "Article",
  "payload": {
    "description": "Published article with scoped public lookup.",
    "access": {
      "authenticated": { "read": "all", "create": "all", "update": "all", "delete": "all" },
      "public": {
        "read": "scoped",
        "create": "none",
        "update": "none",
        "requiredScopes": ["slug"],
        "allowedFilters": ["slug", "status"],
        "allowedSorts": ["publishedAt"],
        "defaultLimit": 1,
        "maxLimit": 10
      }
    },
    "presentation": {
      "titleField": "title",
      "listFields": ["title", "status", "publishedAt"]
    }
  }
}
```

Allowed sections include `description`, `visibility`, `isActive`, `access`, `indexes`,
`relations`, `presentation`, `lifecycle`, and `performance`.

### add_field

```json
{
  "type": "add_field",
  "entityName": "Todo",
  "payload": {
    "fieldName": "priority",
    "field": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "default": "medium"
    },
    "required": false
  }
}
```

Rules:

- Add optional fields or fields with defaults for existing entities.
- If an added field must be required and has no default, align with the user first.
- Add indexes only for actual query paths.

### update_field

```json
{
  "type": "update_field",
  "entityName": "Todo",
  "payload": {
    "fieldName": "priority",
    "patch": {
      "enum": ["low", "medium", "high", "urgent"]
    }
  }
}
```

Usually safe: adding enum values, adding descriptions, adding validation hints.

Risky: removing enum values, changing type, removing defaults, narrowing nullability, or making
existing data invalid.

### delete_field

```json
{
  "type": "delete_field",
  "entityName": "Todo",
  "payload": {
    "fieldName": "legacyTag",
    "removeFromData": false
  }
}
```

Default `removeFromData` to `false`. `true` requires explicit user confirmation.

### set_field_required / unset_field_required

```json
{
  "type": "set_field_required",
  "entityName": "Todo",
  "payload": { "fieldName": "text" }
}
```

Setting required on existing data is risky unless a default exists or old records are known valid.
Unsetting required is usually safe.

### delete_entity

```json
{
  "type": "delete_entity",
  "entityName": "Todo",
  "payload": {
    "mode": "soft",
    "deleteData": false
  }
}
```

Rules:

- Default to `mode: "soft"`.
- `mode: "hard"` requires explicit user request.
- `deleteData: true` requires explicit confirmation.

## Risk Checklist

Stop before apply and align with the user when the patch:

- deletes entity definitions;
- deletes fields used by app UI or AI outputs;
- removes data from historical records;
- changes field types;
- makes fields required without defaults;
- broadens public read;
- enables public create/update;
- removes public scopes/filter/sort limits.

Usually safe to apply directly:

- create a new entity with explicit private/public access;
- add optional fields;
- add fields with defaults;
- add enum values;
- add indexes for known query paths;
- add presentation/performance metadata.

## Sync Handoff

After apply, use the returned version hint:

```json
{
  "next": {
    "recommendedAction": "sync_schema_artifacts",
    "versionId": "dbv_next"
  }
}
```

Then:

1. Call `sync_schema_artifacts` with the version ID and app root.
2. Read `.howone/database/manifest.json`.
3. Leave backend track.
4. If app code must call the entity, read SDK track files and update `src/lib/sdk.ts`.

## Common Mistakes

| Mistake | Correct behavior |
|---|---|
| `payload.definition` for create | Put `properties`, `required`, `access`, etc. directly under `payload`. |
| `payload.patch` for update | Put changed contract sections directly under `payload`. |
| `fields[]` or `requiredFields` | Use `properties` object map and `required` array. |
| Handwriting `.howone/database/manifest.json` | Use `sync_schema_artifacts`. |
| Updating SDK bindings from draft patch | Read synced manifest first. |
| Using public visibility as permission model | Write explicit `access.public`. |
| Deleting data because schema changed | Schema changes do not imply data deletion. |
