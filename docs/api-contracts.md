# Sarangi DMS – API Contracts (Backend RC)

This document is the human-readable counterpart to `docs/openapi.yaml`.
All responses are JSON. Non-2xx responses use a canonical error envelope.

---

## 1. Error envelope

All non-2xx responses follow:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "fieldErrors": {
    "field.path": ["message"]
  },
  "traceId": "optional-request-id"
}
```

- `error`: machine-readable error code (e.g. `VALIDATION_ERROR`, `DUPLICATE_PATIENT`).
- `fieldErrors`: present only for validation errors, keyed by field path (derived from Zod error paths).
- `traceId`: mirrors `req.requestId` so logs and client can correlate.

Validation failures (from Zod) always use:

- HTTP 400
- `error = "VALIDATION_ERROR"`

Auth failures use `AuthError` with:

- `401 UNAUTHORIZED` for missing/invalid access tokens.
- `403 FORBIDDEN` for role violations.

---

## 2. Auth

### POST /auth/login

**Request (application/json)**

```json
{
  "email": "user@example.com",
  "password": "••••••••"
}
```

- Schemas: `LoginRequest` (`@dms/types/auth.ts`).

**Response 200**

```json
{
  "userId": "user-id",
  "role": "RECEPTION|DOCTOR|ADMIN",
  "tokens": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresInSec": 900,
    "refreshExpiresInSec": 1209600
  }
}
```

**Errors**

- `401 INVALID_CREDENTIALS` – email not found or wrong password.
- `423 ACCOUNT_LOCKED` – too many attempts within lock window.

### POST /auth/refresh

- Accepts `{ "refreshToken": "..." }` in body or `refreshToken` cookie.
- On success returns `RefreshResponse` with new token pair.
- Errors:
  - `401 INVALID_REFRESH_TOKEN` – missing/invalid/consumed/expired refresh token.

---

## 3. Patients

### Business rules – uniqueness

- Patients are unique on the composite **(normalized phone, normalized name)**:
  - Phone is normalized by stripping formatting and harmonizing prefixes.
  - Two patients may share a name or a phone but **not both**.
- Implemented via `PATIENT_PHONE_INDEX` + DynamoDB conditional writes.
- Violations → `409 DUPLICATE_PATIENT`.

### Soft delete semantics

- Patients are _soft-deleted_ via `DELETE /patients/:patientId`:
  - The patient record is marked `isDeleted = true` and `deletedAt` is set.
  - Subsequent lookups (`GET /patients/:patientId`, search, visits, billing, X-rays, prescriptions, reports) treat the patient as **missing**.
- Soft-deleted patients:
  - Are excluded from `/patients` search results.
  - Cause dependent read APIs (X-ray URLs, prescription JSON URLs, billing, daily reports) to treat their visits as inaccessible.

### POST /patients

- Role: `RECEPTION`, `ADMIN`.
- Body: `PatientCreate` (`@dms/types/patients.ts`).
- Success:
  - `201` with full `Patient` object.
- Errors:
  - `400 VALIDATION_ERROR` – invalid payload.
  - `409 DUPLICATE_PATIENT` – same normalized phone + name as existing patient.

### GET /patients?query=&limit=

- Role: `RECEPTION`, `DOCTOR`, `ADMIN`.
- Backed by a GSI-based search index:
  - GSI1PK = `PATIENT_SEARCH`, GSI1SK = normalized search text (`name + phone`).
  - Query by GSI and filter on `searchText` and/or `phone` for predictable latency at higher clinic scale.
- Query:
  - `query` – optional string, interpreted as phone-like when digits count ≥ 7; otherwise search by name.
  - `limit` – `1..50`, default `20`.
- Response 200:

```json
{
  "items": [
    /* Patient[] */
  ],
  "nextCursor": null
}
```

---

## 4. Visits & Queue

### Status machine

- Allowed transitions:
  - `QUEUED → IN_PROGRESS`
  - `IN_PROGRESS → DONE`
- Any other transition yields `409 INVALID_STATUS_TRANSITION`.

### Queue behavior (GSI-based)

- Doctor queue is derived from GSI (`doctorId#status#date`) and ordered FIFO by `createdAt`.
- Backend **does not persist queue position numbers**.
- Frontend is responsible for rendering display positions (1, 2, 3, …) from the ordered list.
- A dedicated `/visits/queue/take-seat` route exists to promote a QUEUED visit into `IN_PROGRESS`. It may return:
  - `409 DOCTOR_BUSY` when doctor already has an `IN_PROGRESS` visit.
  - `409 INVALID_STATUS_TRANSITION` for invalid state transitions.

### POST /visits

- Role: `RECEPTION`, `DOCTOR`, `ADMIN`.
- Body: `VisitCreate`.
- Response:
  - `201` with `Visit`.
  - `400 VALIDATION_ERROR` on bad payload.

### GET /visits/queue

- Role: `RECEPTION`, `DOCTOR`, `ADMIN`.
- Query: `VisitQueueQuery` (`doctorId`, optional `date`, optional `status`).
- Response: `{ items: Visit[] }`.

---

## 5. Follow-ups & Daily Reports

### Follow-up rules

- `followUpDate` must be:
  - `>= visitDate`.
  - Not in the past at creation/update time (relative to “today”).
- Only one active follow-up per visit.
- Violations:
  - `400 FOLLOWUP_RULE_VIOLATION`.

### PUT /visits/:visitId/followup

- Upsert follow-up for a visit.
- Role: according to visit access (behind auth + role guards).
- Errors:
  - `400 VALIDATION_ERROR` (payload/id).
  - `400 FOLLOWUP_RULE_VIOLATION` (date rules).
  - `404 VISIT_NOT_FOUND`.

### GET /reports/daily?date=YYYY-MM-DD

- Role: `ADMIN`.
- Aggregates:
  - visitCountsByStatus (QUEUED / IN_PROGRESS / DONE).
  - totalRevenue (from finalized bills).
  - procedureCounts per billing line code/description.
- Only visits whose patients still exist and are not soft-deleted are included.

---

## 6. Billing & Checkout

### POST /visits/:visitId/checkout

- Role: `RECEPTION`, `ADMIN`.
- Body: `BillingCheckoutInput` (lines + optional discount/tax + optional followUp).
- Behavior:
  - Only allowed when visit status is `DONE`.
  - Idempotent per visit:
    - First success: `201` + `Billing`.
    - Repeats: `409 DUPLICATE_CHECKOUT`.
- Rules:
  - Monetary amounts non-negative.
  - Discounts cannot make net payable `< 0`.
  - Follow-up, if present, must obey follow-up rules above.
- Error codes:
  - `400 BILLING_RULE_VIOLATION` – invalid totals.
  - `400 FOLLOWUP_RULE_VIOLATION` – invalid follow-up date.
  - `409 VISIT_NOT_DONE` – visit not yet DONE.
  - `409 DUPLICATE_CHECKOUT` – billing already exists.

### GET /visits/:visitId/bill

- Returns persisted `Billing` if visit & patient exist and are not deleted.
- Otherwise:
  - `404 NOT_FOUND`.

---

## 7. X-rays

### POST /xrays/presign

- Role: `DOCTOR`, `ADMIN`.
- Body:
  - `visitId`, `contentType` (`image/jpeg`|`image/png`), `size` (1KB–10MB).
- Rules:
  - Visit must exist.
  - Patient must exist and not be soft-deleted.
- Success:
  - `201` with `{ xrayId, key, uploadUrl, Headers, expiresInSeconds }`.
- Errors:
  - `400 VALIDATION_ERROR`.
  - `404 VISIT_NOT_FOUND` / `PATIENT_NOT_FOUND`.
  - `503 XRAY_PRESIGN_FAILED` on S3 errors.

### POST /visits/:visitId/xrays

- Registers metadata for a given `xrayId`, size, contentType, `takenAt`, `takenByUserId`.
- Optional:
  - `thumbKey` – S3 key of a pre-generated thumbnail (client- or worker-generated).
- Rules:
  - Visit and patient must exist, patient not deleted.
  - Duplicate `xrayId` for same visit returns `409 XRAY_CONFLICT`.
- Success:
  - `201` with Xray metadata.

### GET /xrays/:xrayId/url?size=thumb|original

- Returns signed GET URL for an X-ray.
- Behavior:
  - For `size=original`, always uses `contentKey`.
  - For `size=thumb`:
    - If `thumbKey` is set in metadata, uses it.
    - Otherwise, falls back to `contentKey` (original image).
- Validations:
  - X-ray must exist and not be soft-deleted.
  - Visit must exist.
  - Patient must exist and not be soft-deleted.
- Errors:
  - `400 VALIDATION_ERROR`.
  - `404 NOT_FOUND` / `VISIT_NOT_FOUND` / `PATIENT_NOT_FOUND`.
  - `503 XRAY_URL_FAILED` on S3 errors.

---

## 8. Prescriptions, Medicines & Presets

### Prescriptions

- Rx JSON is stored in S3; metadata in DynamoDB.
- Versioning is append-only; older versions remain immutable.
- `POST /visits/:visitId/rx`:
  - Role: `DOCTOR`, `ADMIN`.
  - Body: `{ lines: RxLine[] }` with at least one line.
  - Errors:
    - `400 VALIDATION_ERROR`.
    - `404 NOT_FOUND` – visit missing.
    - `404 PATIENT_NOT_FOUND` – patient missing/deleted.
    - `503 RX_UPLOAD_FAILED` – transient failure while storing the prescription JSON in S3; clients should retry with backoff.

### Medicines

- `GET /medicines?query=&limit=`:
  - For typeahead suggestions, response `{ items: MedicineTypeaheadItem[] }`.
- `POST /medicines/quick-add`:
  - Role: `DOCTOR`, `ADMIN`.
  - Body: `QuickAddMedicineInput`.
  - Behavior:
    - Normalizes name and reuses existing preset if present.
    - Otherwise creates preset with `source = INLINE_DOCTOR`, `verified = false`.
  - Errors:
    - `400 VALIDATION_ERROR`.

### Prescription presets

- `GET /rx-presets?query=&limit=`:
  - Returns `{ items: PrescriptionPreset[] }` for builder templates.
- `POST /admin/rx-presets` / `PATCH /admin/rx-presets/:id`:
  - Role: `ADMIN`.
  - Manage clinic-wide template library.

---

## 9. Admin – Doctors

- `POST /admin/doctors`:
  - Role: `ADMIN`.
  - Body: `AdminCreateDoctorRequest`.
- `GET /admin/doctors`:
  - Role: `ADMIN`.
  - Returns list of `AdminDoctorListItem`.
- `PATCH /admin/doctors/:doctorId`:
  - Role: `ADMIN`.
  - Body: `AdminUpdateDoctorRequest`.
  - Errors:
    - `400 INVALID_DOCTOR_ID` if path is missing.
    - `404 DOCTOR_NOT_FOUND` or `500 USER_NOT_FOUND_FOR_DOCTOR` in rare mismatch cases.

---

## 10. Error responses

All non-2xx responses use a common envelope:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "fieldErrors": {
    "field.path": ["validation message 1", "validation message 2"]
  },
  "traceId": "request-id-for-logs"
}
error – machine-readable error code (e.g. VALIDATION_ERROR, DUPLICATE_PATIENT, ACCOUNT_LOCKED).

message – short human-readable description, safe to show to staff.

fieldErrors – present only for validation errors; keys are JSON paths (e.g. name, phone, body.lines.0.medicine).

traceId – optional string you can use when talking to support or searching logs.

Validation errors

Status: 400

Error format:

{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "fieldErrors": {
    "name": ["Name is required"],
    "phone": ["Invalid phone format"]
  },
  "traceId": "..."
}

Domain errors

Examples:

DUPLICATE_PATIENT (409)

XRAY_CONFLICT (409)

BILLING_RULE_VIOLATION (400)

VISIT_NOT_DONE (409)

RX_UPLOAD_FAILED (503), etc.

{
  "error": "DUPLICATE_PATIENT",
  "message": "A patient already exists with this name and phone number",
  "traceId": "..."
}

Auth errors

UNAUTHORIZED, INVALID_REFRESH_TOKEN, FORBIDDEN, ACCOUNT_LOCKED…

{
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid credentials",
  "traceId": "..."
}

Internal errors

For unexpected failures:

{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "Unexpected error",
  "traceId": "..."
}
```

a
