# Backend Query Contracts

Use this reference while designing entity query behavior: filters, sorts, pagination, indexes, and
public constraints. It is backend-only; SDK query syntax belongs in `04-app-sdk/12-query-dsl-and-responses.md`.

## Query Surface

Every list/detail experience should be traceable to fields declared in the entity schema:

| Need | Contract field |
|---|---|
| Filter by status/category/slug | `access.public.allowedFilters` for public reads; schema field exists |
| Sort by date/rank/title | `access.public.allowedSorts` for public reads; `performance.allowedSorts` for app reads |
| Fast owner history | owner-scoped index such as `["status", "updatedDate"]` |
| Public one-record page | `public.read = "scoped"`, `requiredScopes`, low `maxLimit` |
| Search | explicit product support; do not use as a replacement for scopes |

## Filter Fields

Only expose fields that are safe and stable.

Good public filters:

```json
{
  "allowedFilters": ["slug", "status", "category", "active"]
}
```

Avoid public filters for:

- private prompt text;
- owner/user identifiers unless they are intentional route scopes;
- internal moderation fields;
- payment, token, or provider metadata;
- high-cardinality fields that have no index and will be queried frequently.

## Sort Fields

Prefer predictable date or rank fields:

```json
{
  "allowedSorts": ["publishedAt", "updatedDate"],
  "defaultLimit": 20,
  "maxLimit": 100
}
```

Rules:

- Public sort fields must be explicitly listed.
- Sort fields used by large lists should have supporting indexes.
- Do not expose arbitrary revenue, score, or internal ranking fields publicly unless the product
  explicitly needs them.
- Keep public `maxLimit` bounded.

## Index Planning

Design indexes from actual access patterns:

```json
{
  "indexes": [
    { "name": "owner_updated", "fields": ["updatedDate"], "scope": "owner" },
    { "name": "owner_status_updated", "fields": ["status", "updatedDate"], "scope": "owner" },
    { "name": "public_slug_unique", "fields": ["slug"], "unique": true },
    { "name": "public_status_published", "fields": ["status", "publishedAt"], "scope": "global" }
  ]
}
```

Use owner-scoped indexes for private per-user histories. Use global indexes for anonymous public
lists. Use unique indexes for slug/share IDs when routes depend on uniqueness.

## System Fields

Generated records usually expose system fields such as:

| Concept | Typical field |
|---|---|
| record id | `id` |
| created date | `createdDate` |
| updated date | `updatedDate` |
| owner | `createdById` |
| schema version id | `schemaVersionId` |
| schema version number | `schemaVersionNumber` |

Do not design app behavior around raw storage-only names unless the manifest or SDK reference
requires that shape.

## Pagination Defaults

Every list contract should define practical limits:

```json
{
  "performance": {
    "defaultLimit": 20,
    "maxLimit": 100,
    "allowedSorts": ["updatedDate", "createdDate"]
  }
}
```

Public scoped detail pages should usually use:

```json
{
  "defaultLimit": 1,
  "maxLimit": 1
}
```

## Query Contract Checklist

- Every planned filter field exists in `properties`.
- Public filters and sorts are explicitly allowlisted.
- Owner/private histories have owner-scoped indexes.
- Public lists have global indexes for common filter/sort combinations.
- Scoped public pages include required scope fields and low limits.
- List pages have pagination limits before SDK/UI code starts.
- Query implementation is written only after `.howone/database/manifest.json` is synced.
