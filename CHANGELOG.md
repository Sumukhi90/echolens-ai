# Changelog

## 1.1.1 — Audit dependency correction

- Updated the pinned Click version to satisfy the installed FastEmbed/Faster-Whisper `huggingface-hub` dependency while remaining compatible with Uvicorn.

## 1.1.0 — Conversation intelligence upgrade

- Added optional server-side Gemini structured answers with explicit external-processing consent, validated citations, bounded retries/timeouts, and local fallback.
- Added local semantic retrieval with an optional FastEmbed model and SQLite cache; keyword search remains the zero-credential fallback.
- Added cross-meeting/date-filtered Q&A, filtered/sorted meeting search, evidence-linked task management, overdue/completed states, and workspace action CSV export.
- Added participation, duration availability, topic, blocker, unresolved-question, and trend analytics.
- Added optional local WAV/MP3/M4A transcription with upload/duration validation and explicit no-diarization disclosure.
- Added a six-case grounding/action/decision regression dataset, API/UI tests, and additive SQLite duration migration.
- Updated setup, API, architecture, status, security/privacy, testing, data-model, and deployment documentation.

## 1.0.0 — Initial portfolio release

- Added local transcript import, persistent meeting library, evidence-linked structured analysis, keyword search and Q&A, reliability inspection, and report exports.
- Added responsive Next.js workspace, sample demo meetings, tests, and setup/security documentation.
- Live LLM integration intentionally remained disabled.
