# Security and privacy

## Current safeguards

- Transcript imports allow only TXT/Markdown/WebVTT, enforce UTF-8 and a 2 MB cap. Audio accepts WAV/MP3/M4A, validates the filename extension and file signature, caps uploads at 25 MB, and probes duration before transcription (maximum two hours).
- SQL operations use SQLAlchemy bound parameters. Search escapes SQL wildcard characters. CSV fields are neutralized against spreadsheet formula execution.
- CORS defaults to the two localhost frontend origins and does not allow credentials. Override `CORS_ORIGINS` deliberately.
- Gemini credentials are read only by the backend and sent in the provider request header, never returned by settings APIs or logged by application code. Live processing requires server configuration, a `live_ai` request, and explicit per-request consent. The provider receives only the question and retrieved transcript excerpts, not the full database.
- Gemini responses are validated with Pydantic; citations must match retrieved segment IDs. Transcript text is treated as untrusted input and system instructions explicitly prohibit following embedded instructions. Local keyword retrieval remains available if live inference fails.
- FastEmbed and Faster-Whisper run locally. Local embedding vectors are persisted in SQLite; no external vector service is used. Audio temp files are deleted after processing.
- Meeting deletion cascades to associated segments, decisions, action items, evidence references, and embeddings. The SQLite schema update is additive and does not reset existing records.

## Privacy and deployment limits

- `NEXT_PUBLIC_DEMO_MODE=true` enables visitor transcript import and edits using browser-local processing and `localStorage`; it makes no application API or external provider requests. Browser data is not encrypted or synced, is shared by people using the same browser profile, and can be removed by clearing site data or resetting the workspace. Do not use shared-device browser mode for confidential transcripts. The public frontend and its synthetic sample fixtures are visible to visitors.
- Browser mode does not enable Live Gemini, audio transcription, or model-backed semantic retrieval. Do not put any API key or backend URL in the frontend project. This build does not secure or authorize the separate FastAPI backend.
- Transcript contents and SQLite data are not encrypted at rest. Protect the device, account, database, backups, and filesystem permissions.
- This application has **no authentication, authorization, tenant isolation, or access control**. Anyone who can reach the API can read, alter, export, or delete its meeting data. Bind to localhost and do not expose it to LAN or public networks.
- CORS is not authentication. There is no CSRF protection because the local API does not use browser credentials; do not treat CORS as an access-control boundary.
- A user who selects Live AI and confirms consent discloses the matching excerpts and question to Google Gemini. Review the provider’s terms and applicable organizational policy before enabling it for confidential conversations.
- Model downloads require network access on first use. Later inference is local; downloaded model files remain in the user’s cache.
- File size/duration limits do not protect a publicly reachable service from all resource exhaustion. There is no rate limiting, background queue, retention policy, or encrypted backup feature.
- Logs intentionally avoid transcript content and keys. Operational logging/monitoring should retain this data-minimization property.

## Review checklist before any shared deployment

1. Add authentication, authorization, per-user meeting ownership, and tenant-isolation tests.
2. Terminate TLS; define allowed origins and network boundaries; add rate/resource limits.
3. Decide encryption, retention, deletion, backup, and audit-log policies.
4. Review provider disclosures and consent UX with the data owner.
5. Run a broader security and privacy assessment against the chosen deployment model.

This is a local portfolio application, not a hardened production multi-user service. The browser-only frontend can be hosted publicly without exposing FastAPI, but its browser storage is not isolated between people sharing the same browser profile. The unauthenticated FastAPI service cannot be exposed publicly.
