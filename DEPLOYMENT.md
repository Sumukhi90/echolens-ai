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

## Interactive public browser workspace

The Next.js frontend can run a fully interactive, browser-local portfolio experience without exposing FastAPI. It includes synthetic sample meetings and supports visitor-provided TXT, Markdown, and WebVTT imports (up to 2 MB), deterministic analysis, keyword search and evidence Q&A, analytics, heuristic claim inspection, editable action items, deletion, reset, and browser-generated exports. Transcript parsing, analysis, retrieval, and persistence happen in the browser. No transcript is sent to an application API or external AI provider.

Browser workspace data is stored in `localStorage` for the deployed site origin and browser profile. It is not synced or encrypted; other people using the same profile may access it, and clearing site data removes it. Audio transcription, Live Gemini, and model-backed semantic retrieval are unavailable in this mode. It is not a suitable store for confidential transcripts or a shared-device account system.

### Vercel configuration

1. Import the repository into Vercel.
2. Set **Root Directory** to `frontend` and select the **Next.js** framework preset.
3. Use the standard install/build commands (`npm install` and `npm run build`) and default output configuration; no `vercel.json`, API rewrite, or backend project is required.
4. Set `NEXT_PUBLIC_DEMO_MODE=true` for **Production** and **Preview** deployments, then redeploy.
5. Leave `NEXT_PUBLIC_API_URL` unset. Do not configure Gemini keys, other secrets, or a FastAPI URL in this frontend project.

`NEXT_PUBLIC_DEMO_MODE` is a build-time public variable. Verify imports, edits, search, Q&A, and exports in the deployed browser. The browser Network panel should show no requests to an EchoLens application API. The Next.js client and bundled synthetic sample data are public.

To preview the same mode in Windows PowerShell:

```powershell
Set-Location frontend
npm ci
$env:NEXT_PUBLIC_DEMO_MODE = "true"
Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
npm run dev
```

For regular Local Mode, do not set `NEXT_PUBLIC_DEMO_MODE`; run the local FastAPI backend and Next.js frontend using [README.md](./README.md). Local Mode behavior remains unchanged.

## Backend hosting and shared deployments

The browser-local build does not deploy or expose FastAPI. No public backend hosting configuration is supplied. Do not expose the FastAPI service publicly: it has no authentication or authorization, and CORS is not an access-control mechanism. A server-backed shared deployment would first require identity/tenant isolation, TLS, a persistent database strategy, resource limits, backups/retention/deletion policies, secrets management, provider privacy review, and a deployment-specific security assessment.

SQLite is appropriate for local single-user operation. Test a database migration plan before switching to a shared or multi-instance deployment. No deployment or GitHub publishing was performed.
