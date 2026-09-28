#!/bin/bash
set -e

# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Regenerate API hooks and Zod schemas from the OpenAPI spec
(cd lib/api-spec && pnpm exec orval --config ./orval.config.ts)

# 3. Orval overwrites the api-zod barrel on every codegen run; restore the
#    required two-line barrel so AuthUser (from ./types) stays exported
printf 'export * from "./generated/api";\nexport * from "./types";\n' > lib/api-zod/src/index.ts

# 4. Rebuild lib declaration files
pnpm run typecheck:libs

# 5. Push DB schema changes non-interactively
pnpm --filter @workspace/db run push-force
