# Admin API (v1)

## User Management

- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId`
- `POST /api/admin/users/:userId/reset-password`
- `POST /api/admin/users/:userId/deactivate`

## Role Labels

- `GET /api/admin/role-labels`
- `PATCH /api/admin/role-labels/:roleKey`

## Reporting

- `GET /api/admin/reports/attempts`
- `GET /api/admin/reports/export.csv`

## Audit

- `GET /api/admin/audit-events`

