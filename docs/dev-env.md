# Dev Environment

- Start emulators: `npm run dev:emulators:up`
- Stop & clean: `npm run dev:emulators:down`
- API dev: `npm run dev -w @dms/api`
- Smokes: `npm run dev:smoke:aws`, `npm run dev:smoke:types`

Windows note: prefer `127.0.0.1` over `localhost` for emulator endpoints.
S3 dev uses path-style addressing.

Express v5.1, Zod v4 contracts. JWT lib planned: `jsonwebtoken@^9` (+ `@types/jsonwebtoken`).
Bcrypt: `bcrypt@^6` (native).

## S3 / X-ray & Rx storage (LocalStack)

- `XRAY_BUCKET_NAME` – bucket used in dev for:
  - X-ray image objects (original + optional thumbnails).
  - Prescription JSON blobs created by `POST /visits/:visitId/rx`.
- When running `npm run dev:emulators:up` (or `docker compose -f docker-compose.dev.yml up -d`), LocalStack is started and S3 is available at `S3_ENDPOINT` with path-style URLs.
- The API uses presigned URLs for all X-ray uploads/downloads and prescription JSON downloads.
- Transient S3 failures are surfaced as domain-level errors that clients should retry with backoff:
  - `XRAY_PRESIGN_FAILED` – uploading X-rays.
  - `XRAY_URL_FAILED` – downloading X-rays.
  - `RX_UPLOAD_FAILED` – storing prescription JSON.
