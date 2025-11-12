# Contributing

## Commit conventions

We use **Conventional Commits**:

- `feat: …` new feature
- `fix: …` bug fix
- `chore: …` tooling, deps, non-prod code
- `docs: …` docs only
- `refactor: …` internal changes
- `test: …` tests only
- `ci: …` CI config

One commit per dev day unless a critical fix is required.

## Pre-commit hooks

Husky runs:

- `npm run typecheck`
- `npm run lint`

## Workspace scripts

Top-level:

- `npm run dev` → runs all dev processes with Turborepo
- `npm run build` → builds all packages/apps
- `npm run typecheck` → `tsc --build` via Turbo
- `npm run typecheck:clean` → clean build info
- `npm run clean:all` → remove caches and dist
- `npm run dev:emulators:up|down` → DynamoDB Local & LocalStack S3
- `npm run dev:smoke:aws|types`

## Local emulators

Prefer `127.0.0.1` (Windows). S3 uses path-style addressing.

## Code style

- TypeScript strict everywhere.
- ESM modules with `moduleResolution: "Bundler"`.
- Zod schemas define **all** request/response DTOs.
- No hardcoded secrets. Use `.env` and keep values out of git (use `.env.example`).

## Security

- Strict CORS in API.
- No public S3 buckets.
- Short-lived JWT access tokens; refresh tokens stored server-side in future iterations.
