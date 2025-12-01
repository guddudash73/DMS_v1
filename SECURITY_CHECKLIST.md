# DMS Backend Security Checklist

This document captures the current state of backend security hardening for the DMS platform, covering authentication, authorization, rate limiting, input validation, storage security, secrets, dependency hygiene, logging, and observability.

---

## 1. CORS & Security Headers

### Completed

- [x] CORS restricted to a known frontend origin via `CORS_ORIGIN` env.
- [x] Allowed methods limited: `GET, POST, PATCH, PUT, DELETE, OPTIONS`.
- [x] Allowed headers limited: `Content-Type, Authorization, X-Request-Id`.
- [x] Basic security headers applied globally:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `X-XSS-Protection: 0`

### Backlog

- [ ] Separate allowlists for dev / stage / prod environments.
- [ ] Add CSP (Content-Security-Policy) once web frontend is stable.

---

## 2. Authentication, Roles & Rate Limiting

### Completed

- [x] All sensitive routes protected by `authMiddleware` + `requireRole`.
- [x] Per-user lockout:
  - 5 failed login attempts in 15 minutes → `ACCOUNT_LOCKED (423)`.
- [x] Login flood protection:
  - `/auth/login` → 50 attempts per 15 min per IP.
- [x] Sensitive API rate limiting:
  - 100 requests per 5 min per `(ip, path)` for:
    - `/auth`, `/patients`, `/visits`, `/reports`, `/xrays`,
      `/rx`, `/medicines`, `/rx-presets`,
      `/admin/doctors`, `/admin/rx-presets`
- [x] Abuse logs emitted:
  - `auth_login_rate_limited`
  - `api_sensitive_rate_limited`
  - `auth_login_invalid_user`
  - `auth_login_bad_password`
  - `auth_login_locked`

### Backlog

- [ ] Tune rate-limit thresholds with real stage/prod traffic.
- [ ] Consider role-aware rate limits (ADMIN flows vs patient search flows).

---

## 3. Input Validation & ID Integrity

### Completed

- [x] All major endpoints use Zod schemas.
- [x] Path IDs validated before DynamoDB access:
  - `VisitId`, `XrayId`, `PatientId`, `PrescriptionId`, etc.
- [x] Invalid IDs never hit the DB (prevents soft-delete leaks + DDB capacity waste).

### Backlog

- [ ] Perform a full sweep of `patients.ts`, `rx.ts`, and other routers.
- [ ] Add negative-path tests to confirm invalid IDs are always rejected.

---

## 4. Storage Security (S3)

### Completed (Application Level)

- [x] All X-ray and Rx JSON uploads use:
  - `ServerSideEncryption: "AES256"` (SSE–S3)
- [x] X-ray rules enforced:
  - Visit must exist.
  - Patient must exist & not soft-deleted.
- [x] X-ray access audited:
  - `XRAY_PRESIGN_UPLOAD`, `XRAY_URL_REQUEST`, `XRAY_METADATA_CREATED`

### Backlog (Infra Level – Week 5)

- [ ] S3 bucket must enforce:
  - Block Public Access = **ON**
  - Default Encryption = **SSE-S3** or **KMS**
- [ ] Add KMS CMK for medical data.
- [ ] Tighten IAM permissions to bucket + KMS key.

---

## 5. Secrets & Configuration

### Completed

- [x] All config centrally managed via `@dms/config/env`.

### Backlog

- [ ] Move secrets to:
  - AWS SSM Parameter Store (SecureString) **or**
  - AWS Secrets Manager
- [ ] Implement JWT key rotation strategy.
- [ ] Never store PHI or private keys in `.env` for prod.

---

## 6. Dependency Security

### Completed

- [x] Removed SST + hono + opencontrol dependency chain (source of CVEs).
- [x] `npm audit` no longer shows infra-related vulnerabilities.

### Backlog

- [ ] Weekly CI-based `npm audit` report.
- [ ] Classify CVEs by severity & respond accordingly.

---

## 7. Logging, Monitoring & Costs

### Completed

- [x] Structured JSON logging:
  - `http_access`, `auth_error`, `unhandled_error`, `audit`
- [x] Per-request `reqId` applied.
- [x] Sensitive operations logged at audit level.

### Backlog (Week 5)

- [ ] CloudWatch log groups + retention.
- [ ] CloudWatch alarms for:
  - p95 latency
  - 5xx rate
- [ ] AWS Budgets (80% / 100% thresholds).
- [ ] Automated tests verifying log invariants.

---

## 8. OWASP Baseline

### Completed

- [x] Injection protection (DDB-only, typed inputs).
- [x] Broken auth mitigated (JWT, lockout, rate limiting).
- [x] Sensitive data security (SSE-S3).
- [x] Security misconfiguration addressed (CORS, headers, roles).

### Backlog

- [ ] Monitoring gaps (no CloudWatch alarms).
- [ ] Infra vulnerability checks once deployed.
- [ ] Formal OWASP review after deployment week.

---

**Status:**  
Day-15 backend security hardening complete.  
Pending items scheduled for Week 5 (Infra + Deployment Hardening).
