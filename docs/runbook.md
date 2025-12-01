# DMS Backend Runbook

Operational guide for on-call engineers, developers, and deployment maintainers.

This runbook covers logging, rate limiting, S3 storage rules, secrets, and handling of common backend operational scenarios.

---

# 1. Logging & Observability

## 1.1 Log Types

### `http_access`

Generated for every request.
Includes:

- `reqId`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `userId` (if available)

### `auth_error`

Authentication/authorization errors:

- invalid token
- expired token
- missing role
- lockouts

### `unhandled_error` / `unhandled_error_non_error`

Backend exceptions:

- thrown Errors
- rejected promises
- unexpected failures

### `audit`

Sensitive action logs:

- X-ray metadata creation
- Rx operations
- Follow-up updates
- Admin doctor/preset changes
- Login failures

---

# 2. Rate Limiting & Abuse Handling

## 2.1 Login Rate Limiting

- 50 attempts per 15 minutes per IP.
- Designed to stop credential stuffing.

**Common log events:**

- `auth_login_rate_limited`
- `auth_login_invalid_user`
- `auth_login_bad_password`
- `auth_login_locked`

## 2.2 Sensitive Route Rate Limiting

- 100 requests per 5 minutes per `(ip, path)` for:
  - `/auth`
  - `/patients`
  - `/visits`
  - `/reports`
  - `/xrays`
  - `/rx`
  - `/medicines`
  - `/rx-presets`
  - `/admin/*`

**Common log event:**  
`api_sensitive_rate_limited`

**Operator guidance:**  
If legitimate users hit limits → raise the threshold or adjust for roles.

---

# 3. Storage Security (S3 buckets)

## 3.1 Medical Data (X-rays + Rx JSON)

All medical files must:

- Be encrypted at rest (AES256 SSE-S3).
- Be associated with valid patient + visit.
- Never be publicly accessible.
- Never be logged in raw form.

## 3.2 Application-Level Guarantees

The backend enforces:

- `ServerSideEncryption: "AES256"` on uploads.
- Pre-signed URLs expire quickly (90s default).
- Validation ensuring:
  - Patient exists & not soft-deleted
  - Visit exists & owned by same patient

## 3.3 Infra Requirements (to be implemented Week 5)

X-ray bucket must have:

### **1. Block Public Access ON**

- BlockPublicAcls
- IgnorePublicAcls
- BlockPublicPolicy
- RestrictPublicBuckets

### **2. Default Encryption ON**

- SSE-S3 (`AES256`) or
- KMS (recommended for medical data)

### **3. IAM Restrictions**

- Only API role may:
  - GetObject
  - PutObject
  - DeleteObject (optional, retention policy-driven)

---

# 4. Secrets & Configuration

## 4.1 Secrets Location (Production)

Use one of:

- AWS **Systems Manager Parameter Store** (SecureString)
- AWS **Secrets Manager**

Recommended secrets:

- JWT signing keys
- DynamoDB table name
- X-ray bucket name
- KMS key ID (future)
- Email/SMS provider creds (if added)
- Any PHI-protected service keys

## 4.2 Rotation Strategy

1. Create new secret version.
2. Deploy API that supports both old+new key temporarily.
3. Validate in stage.
4. Remove old key from allowed list.
5. Document rotation.

---

# 5. On-Call Playbook

## 5.1 Login Flooding

Symptoms:

- Many `auth_login_rate_limited` logs.
- 50x or 4xx errors on `/auth/login`.

Action:

- Check offending IP.
- Raise limit temporarily (if legitimate).
- Consider banning IP at ALB or WAF (infra day).

---

## 5.2 Backend Errors (500)

Symptoms:

- `unhandled_error` logs.
- Spike in 5xx.

Action:

- Inspect stack traces.
- Reproduce failing route locally.
- Apply hotfix (patch release).

---

## 5.3 Slowdowns / Latency

Symptoms:

- `durationMs` increasing.
- p95 latency alerts (future Week 5 alarms).

Action:

- Check DynamoDB throttles (CloudWatch).
- Check massive reports queries.
- Optimize slow endpoints.

---

# 6. Costs & Budgets

## 6.1 AWS Budgets (Week 5)

Configure:

- Monthly budget (e.g., $25)
- Alerts:
  - 80%
  - 100%
- Recipients:
  - On-call email
  - Dev team Slack (optional)

## 6.2 Cost Drivers

Primary:

- DynamoDB reads/writes.
- S3 storage for X-rays.

Secondary:

- CloudWatch logs.
- Data transfer (S3 downloads).

---

# 7. Future Infra Work (Week 5)

- Create real `infra/` package.
- Add SST or CDK-based AppStack:
  - DynamoDB table
  - X-ray bucket
  - API
  - IAM
  - CloudWatch alarms
  - Log retention
- Integrate CI/CD deployments.
- Add WAF rate-limit rules (optional).

---

**Status:**  
Runbook updated on Day-15 to include all backend security, S3 practices, secrets guidance, and rate limiting behaviors.
