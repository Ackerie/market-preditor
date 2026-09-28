---
name: codegen + api-zod barrel
description: After running orval codegen, the api-zod barrel must be manually fixed
---

After `pnpm --filter @workspace/api-spec run codegen`, orval regenerates `lib/api-zod/src/index.ts` with a stale line:
```
export * from "./generated/api.schemas";  // ← MUST DELETE
```

The file `api.schemas.ts` does not exist in `lib/api-zod/src/generated/` (only `api.ts`). The barrel must be rewritten to exactly:
```ts
export * from "./generated/api";
export * from "./types";
```

`src/types.ts` is a hand-written (non-generated) file that derives the `AuthUser` type from the generated Zod schema — the api-server imports `AuthUser` from `@workspace/api-zod`, and orval's Zod plugin emits no TypeScript types, only runtime schemas. Dropping the `./types` export breaks api-server typecheck with "no exported member 'AuthUser'".

**Why:** Orval's Zod plugin only emits one file (`api.ts`) but the barrel template references a second file that doesn't exist, breaking `tsc --build`; and hand-written type exports live outside the generated folder so they survive codegen.

**How to apply:** Always rewrite the barrel to the two lines above immediately after codegen, before any typecheck.

Also: orval escapes `*` inside OpenAPI `pattern` strings when emitting `new RegExp("...")` (produces `\*`, which is functionally identical in JS but flagged by reviewers as a bug). Prefer bounded quantifiers like `{0,4}` instead of `*` in OpenAPI patterns — those pass through unescaped.
