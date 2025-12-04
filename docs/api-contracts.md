# Auth API Contracts (Day 5)

## POST /auth/login

Request (application/json)
{
"email": "user@example.com",
"password": "string(min 8, max 128)"
}

Response 200
{
"userId": "ulid",
"role": "RECEPTION|DOCTOR|ADMIN",
"tokens": {
"accessToken": "jwt",
"refreshToken": "jwt",
"expiresInSec": 900,
"refreshExpiresInSec": 1209600
}
}

## POST /auth/refresh

Request
{ "refreshToken": "string(min 20)" }

Response 200
{ "tokens": { ...TokenPair } }

Notes

- Schemas in `@dms/types/auth.ts`
- Validation via Zod middleware (400 on invalid)
- Implementation TBD (bcrypt + jsonwebtoken v9)

---

## Patients API (notes)

### POST /patients

- On success: `201` with `Patient` body.
- On validation error: `400` with `{ "error": "VALIDATION_ERROR", "issues": [...] }`.
- On duplicate phone (normalized, e.g. `+91` vs leading `0`): `409` with:

```json
{
  "error": "DUPLICATE_PATIENT",
  "message": "A patient already exists with this phone number"
}
```
