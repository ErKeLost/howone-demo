# Backend Access Models

Use this reference while designing entity `access` contracts with `backend-api-design`.
It is backend-only: do not write SDK calls from this file.

Access answers four questions:

1. Who can read records?
2. Who can create records?
3. Who can update/delete records?
4. Which anonymous public operations are safe?

## Authenticated Access

Authenticated access is for logged-in users. Values are `own`, `all`, or `none`.

Private per-user records:

```json
{
  "access": {
    "authenticated": {
      "read": "own",
      "create": "own",
      "update": "own",
      "delete": "own"
    },
    "public": {
      "read": "none",
      "create": "none",
      "update": "none",
      "delete": "none"
    }
  }
}
```

Shared authenticated records:

```json
{
  "access": {
    "authenticated": {
      "read": "all",
      "create": "all",
      "update": "all",
      "delete": "all"
    },
    "public": {
      "read": "none",
      "create": "none",
      "update": "none",
      "delete": "none"
    }
  }
}
```

Use `all` conservatively. If the product implies team roles, moderation, or ownership transitions
that the dynamic schema cannot express yet, keep the schema narrow and leave role logic to a future
platform capability or app-owned guard.

## Public Read

Public read is for anonymous access. Values are `none`, `list`, or `scoped`.

Use `list` only when broad anonymous browsing is intended:

```json
{
  "access": {
    "authenticated": {
      "read": "all",
      "create": "all",
      "update": "all",
      "delete": "all"
    },
    "public": {
      "read": "list",
      "create": "none",
      "update": "none",
      "delete": "none",
      "allowedFilters": ["status", "category", "slug"],
      "allowedSorts": ["publishedAt", "updatedDate"],
      "defaultLimit": 20,
      "maxLimit": 100
    }
  }
}
```

Use `scoped` when a public page should expose only records that match route-bound scope fields:

```json
{
  "access": {
    "public": {
      "read": "scoped",
      "requiredScopes": ["shareId"],
      "allowedFilters": ["shareId", "active"],
      "allowedSorts": ["updatedDate"],
      "defaultLimit": 1,
      "maxLimit": 1
    }
  }
}
```

Public rules:

- Public filters must be listed in `allowedFilters`.
- Public sorts must be listed in `allowedSorts`.
- Scoped reads must include every `requiredScopes` field.
- Public records must not contain private prompts, tokens, internal review states, or owner-only data.
- Public list entities need indexes covering common filters and sorts.

## Public Create

Public create is only for anonymous submissions such as waitlists, contact forms, feedback, and
public RSVP flows.

```json
{
  "access": {
    "public": {
      "read": "none",
      "create": "scoped",
      "update": "none",
      "delete": "none",
      "requiredScopes": ["created_by_user_id"],
      "allowedFilters": [],
      "allowedSorts": [],
      "defaultLimit": 1,
      "maxLimit": 1
    }
  }
}
```

Do not enable public create for user libraries, generated histories, admin content, or entities that
store sensitive workflow output. Add app-owned anti-abuse controls when anonymous submission is open.

## Access Design Checklist

- The entity has the narrowest access model that supports the product.
- Private history uses authenticated `own`.
- Shared admin/internal data uses authenticated `all` only when acceptable.
- Public list data exposes only safe fields.
- Public scoped pages use stable scope fields and low `maxLimit`.
- Public create has a clear ownership/scope story and no anonymous read by default.
- Access decisions are synced before SDK/UI implementation starts.
