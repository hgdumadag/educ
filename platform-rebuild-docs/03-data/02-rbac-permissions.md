# RBAC Permissions

## Admin

- create/update/deactivate users
- edit role display labels
- view all assignments, attempts, and results
- access system settings and audit logs

## Teacher

- upload and manage lessons/exams they own
- assign lessons/exams to students
- view attempts/results for assigned students
- export class results

## Student

- view assigned lessons/exams
- create/continue attempts
- submit answers
- view own results

## Enforcement

- Every API endpoint must check role claims.
- Ownership checks required for teacher-managed resources.
- UI guards are convenience only; backend checks are mandatory.

