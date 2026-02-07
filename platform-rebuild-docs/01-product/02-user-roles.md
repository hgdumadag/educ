# User Roles

## System Roles

- `admin`
- `teacher`
- `student`

These are fixed internal role keys used in code and database.

## Display Labels

Role labels shown in UI are configurable by admins.

Example:

- internal: `teacher`
- display: `Instructor`

Rules:

- Internal role keys never change.
- Display label changes must not affect permissions.
- Default labels are `Admin`, `Teacher`, `Student`.

