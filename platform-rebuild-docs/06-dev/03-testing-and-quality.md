# Testing and Quality

## Required Test Layers

- Unit: validators, normalization, grading helpers
- Integration: auth guards, upload flow, attempt submit flow
- UI smoke: login -> assignment -> attempt -> result

## Minimum Quality Gates

- TypeScript strict mode passes
- ESLint passes
- Unit + integration tests pass in CI
- No direct secrets in frontend bundle

## Suggested Commands

```bash
npm run lint
npm run test
npm run test:integration
npm run build
```

