# Normalization Rules

## Purpose

Convert uploaded content to one internal exam model before storage.

## Rules

- IDs are slug-safe and unique.
- Question IDs become deterministic (`q1`, `q2`, ... if missing).
- Boolean answers normalized to booleans (not `"true"`/`"false"` strings).
- Question type aliases mapped to canonical set:
  - `multiple-choice`
  - `true-false`
  - `short-answer`
  - `long-answer`
- Time limits and passing score default values applied if omitted.

## Reject Conditions

- missing title or question set
- unsupported question type
- malformed answer schema
- duplicate question IDs after normalization

