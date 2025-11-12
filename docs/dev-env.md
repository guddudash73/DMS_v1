# Dev Environment

- Start emulators: `npm run dev:emulators:up`
- Stop & clean: `npm run dev:emulators:down`
- API dev: `npm run dev -w @dms/api`
- Smokes: `npm run dev:smoke:aws`, `npm run dev:smoke:types`

Windows note: prefer `127.0.0.1` over `localhost` for emulator endpoints.
S3 dev uses path-style addressing.

Express v5.1, Zod v4 contracts. JWT lib planned: `jsonwebtoken@^9` (+ `@types/jsonwebtoken`).
Bcrypt: `bcrypt@^6` (native).
