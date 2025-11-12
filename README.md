# DMS — Dev Environment (Day 4)

## Prereqs

- Node.js 24.x (LTS "Krypton")
- Docker Desktop

## Start local emulators

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Useful scripts

`npm run typecheck` – full graph check with project references
`npm run clean:all` – clear caches and build outputs
