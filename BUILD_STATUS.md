# Build status

## Implemented

- Existing Next.js/TypeScript and FastAPI/SQLite application retained, including transcript parsing/import, evidence-linked summaries, decisions/actions, search, meeting Q&A, Reliability Inspector, demo data, and Markdown/text/CSV exports.
- Optional backend-only Gemini provider with structured Pydantic output, request timeout/retry, citation ID validation, explicit consent, and local fallback.
- Cross-meeting Q&A and date/meeting filters; optional FastEmbed local semantic retrieval with SQLite vector cache and keyword fallback.
- Persistent editable action items, status/overdue calculation, repeated-task indicators, evidence-linked task records, and workspace CSV export.
- Analytics for participation, topic frequencies/trends, recurring blocker text, unresolved questions, and speaking time only when complete duration/speaker data exists.
- Optional local WAV/MP3/M4A transcription with type/size/duration checks, timestamps, CPU/int8 Faster-Whisper, and no claimed diarization.
- Additive SQLite migration for segment duration; no user database was deleted/reset.
- Updated accessible/responsive UI, settings disclosure, processing states, and authored backend/frontend regression tests.
- Added an interactive public browser-only workspace: transcript parsing and analysis, keyword search/Q&A, analytics, heuristic claim checks, editable actions, delete/reset, and exports use local browser storage without calling FastAPI.

## Verification

- Backend: `python -m compileall -q backend\app backend\tests`; **21 tests passed**, including an API end-to-end import-to-answer/action-export workflow.
- Frontend: **11 Vitest tests passed**; TypeScript check passed. Tests verify browser-local Markdown, text, and CSV export contents. Next.js production builds succeeded with both `NEXT_PUBLIC_DEMO_MODE=true` and unset (Local Mode).
- Evaluation: six authored cases executed. Retrieval hit@5 **1.00**, citation precision **1.00**, unsupported-citation rate **0.00**, abstention accuracy **1.00**, action extraction precision/recall/F1 **1.00**, explicit-owner accuracy **1.00**, decision-classification precision/recall/F1 **1.00**, prompt-injection abstention **1.00**.
- Local semantic inference: downloaded and executed `BAAI/bge-small-en-v1.5` through FastEmbed; verified 384-dimensional vectors and a local retrieval smoke test, including exclusion of unrelated/unsupported fixture results after thresholding.
- Audio pipeline: mocked local transcription, timestamp/duration preservation, upload validation, and API import tested. No speech model was downloaded or real audio quality benchmark performed.
- Gemini: mocked HTTP retry, structured validation, consent, citation allowlisting, and secret non-disclosure tested. No live key/provider request was made.
- Migration: tested additive, idempotent column addition while preserving an existing row.
- Manual browser/API smoke: seeded demo data into an isolated temporary database and exercised cross-meeting Ask, evidence citations, action management, and analytics views; the temporary database was removed afterward.
- Public browser production smoke: imported a synthetic TXT transcript, refreshed and verified persistence, asked an evidence-backed question, inspected a claim, edited/completed an action, and loaded analytics. No application API requests or browser page errors were observed. The browser-only mode was built with `NEXT_PUBLIC_DEMO_MODE=true`; no backend was exposed.

Evaluation figures are measured only on the small authored six-case regression set; they are not representative benchmark or accuracy claims. The optional local embedding smoke check is separate from the keyword evaluation metrics.

## Known limitations and next work

- The reliability inspector and deterministic extraction are heuristics, not truth guarantees; review evidence before acting.
- The authored evaluation set is small and should be expanded with reviewed, diverse transcript examples and adversarial cases.
- Audio model download and real-file transcription quality were not verified; no speaker identification/diarization is implemented.
- Live Gemini was tested with mock transport only; external-provider behavior still requires a user-provided key and a consented manual test.
- FastEmbed model download may require network access initially. The actual model was smoke-tested locally; production behavior across varied meetings still needs evaluation.
- There is no authentication/authorization, database encryption, multi-user access control, background processing, or public deployment. Keep the service local.
- Public browser mode stores visitor data in unencrypted `localStorage` scoped to the site origin and browser profile. It is not private from other people using the same profile; audio transcription, Live Gemini, and model-backed semantic retrieval are unavailable there.
