# Content API (v1)

## `POST /api/lessons/upload` (teacher/admin)

Multipart upload of lesson package ZIP.

Response:

- normalized lesson metadata
- validation warnings/errors

## `GET /api/lessons`

Role-aware list:

- admin: all
- teacher: own + shared
- student: assigned only

## `GET /api/lessons/:lessonId`

Returns lesson metadata + renderable content references.

## `DELETE /api/lessons/:lessonId`

Soft-delete (teacher owner or admin).

