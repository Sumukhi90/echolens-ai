# Advanced upgrade plan and completion

## Audited baseline

- Frontend: Next.js App Router, TypeScript, one client-side workspace, landing page, Vitest/JSDOM tests.
- Backend: FastAPI, SQLAlchemy, SQLite, transcript parser, deterministic analyzer, and established API routes.
- Existing functionality and response shapes were kept; additions are backward-compatible. An existing `echolens.db` was preserved and only an additive duration column migration was applied.
- Baseline before implementation: 12 backend tests and 2 frontend tests passed. The working directory is not a Git repository.

## Phases

| Phase | Result |
|---|---|
| Compatibility and schema safety | Existing routes preserved; migration adds nullable `duration_seconds` without resetting persisted data. |
| Retrieval and evaluation | Cross-meeting/date filters, local semantic retrieval with SQLite cache and keyword fallback, citation checks, and authored offline regression set. |
| Optional live AI | Server-side Gemini structured output, Pydantic validation, retry/timeout, explicit consent, citation allowlisting, and local fallback. |
| Tasks and analytics | Persistent editable actions, pending/completed/overdue handling, evidence links, repeated-task indicators, global CSV export, and transcript-derived analytics. |
| Optional audio | Local WAV/MP3/M4A processing with signature/size/duration checks and Faster-Whisper; existing text imports remain independent. |
| Product UI and verification | Cross-meeting Ask, search filters/sorting, action manager, analytics, live-AI consent, audio import, responsive/accessibility states, tests and production build. |
| Documentation | Setup, API, architecture, status, privacy, testing, deployment, changelog, and limitations updated. |

## Dependency decisions and remaining scope

- No paid service, hosted vector store, or provider SDK is mandatory.
- FastEmbed/BGE and Faster-Whisper/audio model downloads are optional and local.
- Gemini is optional and requires a user-controlled server key plus explicit per-request consent.
- No authentication, collaboration, public hosting, diarization, or real-time background job processing was added. These require additional design and privacy review.
- The complete execution record and measured results are in [BUILD_STATUS.md](./BUILD_STATUS.md) and [TESTING.md](./TESTING.md).
