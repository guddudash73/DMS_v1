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
-
