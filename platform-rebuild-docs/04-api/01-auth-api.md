# Auth API (v1)

## `POST /api/auth/login`

Request:

```json
{ "identifier": "user@example.com", "password": "secret" }
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": { "id": "u1", "role": "teacher", "displayRole": "Teacher" }
}
```

## `POST /api/auth/refresh`

Request:

```json
{ "refreshToken": "jwt" }
```

## `POST /api/auth/logout`

Invalidates refresh token.

## `GET /api/auth/me`

Returns current user profile and effective permissions.

