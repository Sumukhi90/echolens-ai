# Deployment

## Local use

EchoLens is designed for single-user local use. Follow the exact Windows PowerShell commands in [README.md](./README.md). Run FastAPI on `127.0.0.1:8000` and Next.js on the local development port. The SQLite database is persistent across restarts; preserve it when upgrading.

## Optional configuration

Set server-only values in a root `.env` file:

- `GEMINI_API_KEY` and `LIVE_AI_ENABLED=true` to enable the optional Gemini path; each request still requires explicit UI consent.
- `LOCAL_EMBEDDINGS_ENABLED=true` to enable optional on-device FastEmbed semantic retrieval.
- `WHISPER_MODEL=base` to select the optional local speech model.
- `DATABASE_URL` to select a database URL supported by SQLAlchemy; the additive duration migration is SQLite-specific.
- `CORS_ORIGINS` to specify trusted local frontend origins.

Never put provider secrets in frontend variables such as `NEXT_PUBLIC_*`.

## Hosting

No hosting platform, public deployment, or permanently free tier is configured. Do not expose this service publicly: it has no authentication or authorization, and CORS is not an access-control mechanism. A shared deployment requires identity/tenant isolation, TLS, a persistent database strategy, resource limits, backups/retention/deletion policies, secrets management, provider privacy review, and a deployment-specific security assessment.

SQLite is appropriate for local single-user operation. Test a database migration plan before switching to a shared or multi-instance deployment. No deployment or GitHub publishing was performed.
