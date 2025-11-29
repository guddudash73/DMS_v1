# DMS Backend Runbook

## 1. Overview

This runbook documents how to:

- Trace requests using **request IDs** and structured logs.
- Respond to **5xx rate** and **latency** alarms on the API.
- Use **AWS Budgets** to keep costs under control.

The backend is an Express API running behind AWS infrastructure provisioned with SST. Logs are written in structured JSON and shipped to CloudWatch Logs (or equivalent). :contentReference[oaicite:6]{index=6}

---

## 2. Logs & Request IDs

### 2.1 Request IDs

Every HTTP request gets a `reqId`:

- Preferred: client sends `X-Request-Id` header.
- Otherwise: backend generates a UUID.

The `reqId` is:

- Attached to `req.requestId` in Express.
- Included in:
  - Access logs (`event: "http_access"`)
  - Auth errors (`event: "auth_error"`)
  - Unhandled errors (`event: "unhandled_error"`)

### 2.2 Access log shape

Each completed request writes a single line:

```json
{
  "t": 1710000000000,
  "level": "info",
  "event": "http_access",
  "reqId": "2c010f3a-...",
  "method": "POST",
  "path": "/visits/123/checkout",
  "statusCode": 201,
  "durationMs": 42.1,
  "userId": "user-abc123"
}
```
