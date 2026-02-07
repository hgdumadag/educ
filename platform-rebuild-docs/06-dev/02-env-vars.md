# Environment Variables

## API

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/platform
JWT_ACCESS_SECRET=replace_me
JWT_REFRESH_SECRET=replace_me
OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-4o-mini
UPLOAD_STORAGE_MODE=local
UPLOAD_LOCAL_PATH=./data/uploads
```

## Web

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

## Security Notes

- Never commit `.env`.
- Rotate secrets when moving environments.
- OpenAI key must exist only on API runtime.

