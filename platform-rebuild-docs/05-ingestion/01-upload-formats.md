# Upload Formats

## Lesson Package (ZIP)

Expected structure:

```text
grade-X/subject/quarter-Y/topic-name/
  metadata.json
  content.md
  practice.json (optional)
  assessment.json (optional)
  images/*
```

## Exam JSON

Accepted source formats:

- legacy `examMetadata + questions + settings`
- legacy `examId + examType + questions`

Both are accepted at upload time and normalized to one internal format.

## Validation Output Contract

Every upload returns:

- `valid` boolean
- `errors[]`
- `warnings[]`
- `normalizedPreview` (when possible)

