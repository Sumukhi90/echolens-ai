# Architecture

## Components

- `frontend/app/page.tsx`: Next.js client workspace, cross-meeting Ask, search filters, action management, analytics, per-meeting Q&A/inspector, and import/export flows.
- `backend/app/main.py`: FastAPI routes, CORS allowlist, persistence orchestration, validation, settings, and exports.
- `backend/app/transcripts.py`: UTF-8 TXT/Markdown/WebVTT parsing and transcript upload limits.
- `backend/app/audio.py`: optional local WAV/MP3/M4A validation, duration probing, temporary-file processing, and Faster-Whisper transcription.
- `backend/app/analysis.py`: deterministic extraction of topics, points, tentative/confirmed decisions, actions, unresolved items, and blockers.
- `backend/app/retrieval.py`: keyword fallback and optional FastEmbed semantic ranking with cached per-segment vectors.
- `backend/app/providers.py` / `ai_schemas.py`: server-only Gemini HTTP adapter and validated structured output.
- `backend/app/evaluation.py` / `backend/evaluation/cases.json`: authored, reproducible grounding/action/decision regression dataset and metric runner.
- `backend/app/models.py` / `database.py`: SQLAlchemy entities, SQLite foreign-key enforcement, and additive schema migration.

## Data flow and trust boundaries

1. The browser previews text locally and sends transcript/audio uploads to the API. Audio is only decoded/transcribed locally when the optional dependency and model are available.
2. The API validates type, content, and size; persists the original transcript and timestamped/speaker-labelled segments; and runs deterministic analysis.
3. Q&A retrieves from the selected meetings/date range. By default it returns excerpts and abstains if its retrieval threshold does not find sufficient evidence. Semantic retrieval is local and can fall back to keyword search.
4. Live AI is an explicit opt-in path: a request must select `live_ai`, include consent, and the backend must have `LIVE_AI_ENABLED=true` and a server-only `GEMINI_API_KEY`. Only retrieved excerpts and the question are sent. Transcript content is passed as untrusted data; structured Pydantic output and citation IDs are checked against retrieved segment IDs. Provider errors return local evidence results.
5. Analytics aggregate persisted transcript metadata and deterministic analysis. Speaking-time figures are withheld unless all relevant segments contain speaker labels and durations.
6. Actions, meeting records, and cached embeddings persist in SQLite. Deleting a meeting removes dependent records through cascading relationships. Schema changes are additive; the app never resets or deletes an existing database.

## Modes and optional dependencies

- Demo data is available from `POST /api/demo/seed` and is idempotent.
- Local mode requires no credentials or remote infrastructure.
- FastEmbed and its model are optional; keyword retrieval remains available if the package/model cannot be used.
- Live Gemini uses the existing `httpx` dependency and Google’s HTTPS API; no provider SDK is required.
- Faster-Whisper/PyAV and a speech model are optional. Transcription preserves times but does not identify speakers.

## Deployment boundary

The default database is `echolens.db` at the project root; `DATABASE_URL` can override it. The API defaults to localhost and local CORS origins. There is no authentication or authorization, database encryption, collaboration, or multi-user isolation. Do not expose private transcripts to a public or shared network.
