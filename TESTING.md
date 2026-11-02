# Testing

## Reproducible checks on Windows PowerShell

Run from the repository root with the project virtual environment installed:

```powershell
.\.venv\Scripts\python.exe -m compileall -q backend\app backend\tests
.\.venv\Scripts\python.exe -m pytest backend\tests -q
Set-Location frontend
npm test
npm run build
Set-Location ..\backend
..\.venv\Scripts\python.exe -m app.evaluation
```

The backend tests cover import parsing/validation, existing API behavior and persistence, deletion cascades, evidence-grounded and abstaining Q&A, injection text, action editing/status/CSV, cross-meeting/date filters, analytics availability and timed speaking data, audio validation/transcription with a fake model, semantic vector ranking/cache with a deterministic fake embedder, Gemini retry/schema/citation/consent behavior with mocked HTTP, and safe additive schema migration. An API end-to-end test exercises transcript import through analysis, cited cross-meeting Q&A, search, action completion, CSV export, and deletion. No live API key, external provider call, or speech model download is needed by the tests.

The frontend Vitest tests cover workspace/import validation and interactions with the cross-meeting Ask, action manager, and analytics views. The production build runs Next.js compilation, TypeScript checks, and static page generation. Browser-based end-to-end automation is not configured.

## Executed evaluation

`python -m app.evaluation` ran the six authored cases in `backend/evaluation/cases.json`. The cases cover explicit owners, confirmed and tentative decisions, cross-meeting evidence, unknown deadlines, and prompt-injection/abstention behavior. Measured values:

| Metric | Result |
|---|---:|
| Keyword retrieval hit@5 | 1.00 |
| Citation precision | 1.00 |
| Unsupported citation rate | 0.00 |
| Correct abstention rate | 1.00 |
| Action extraction precision / recall / F1 | 1.00 / 1.00 / 1.00 |
| Explicit owner accuracy | 1.00 |
| Decision classification precision / recall / F1 | 1.00 / 1.00 / 1.00 |
| Prompt-injection abstention | 1.00 |

These are actual results from this small hand-authored regression set, not a representative benchmark. Perfect scores indicate fixture coverage, not expected real-world accuracy. Expand and review the dataset before making product accuracy claims.

The actual `BAAI/bge-small-en-v1.5` model was separately downloaded and run through FastEmbed. It generated 384-dimensional vectors and ranked the migration/blocker passage above unrelated lunch text. The labeled six-case evaluation above measures the always-available keyword path; semantic retrieval is covered by deterministic cache/ranking tests and a separate real-model smoke check.

## Manual optional checks

- **Gemini:** set `GEMINI_API_KEY` and `LIVE_AI_ENABLED=true` only in a private backend `.env`, restart the API, select Live AI, and explicitly consent. This was not exercised against a real provider in this implementation.
- **Audio:** install `backend\requirements-audio.txt`; use a short test audio file and verify local model download, transcript content, and timestamps. Fake transcriber tests do not establish speech-recognition quality. Do not expect speaker diarization.
- **Semantic model:** install `backend\requirements-ai.txt`, set `LOCAL_EMBEDDINGS_ENABLED=true`, and make a first-use model download available. Keyword retrieval remains the fallback if the model cannot be used.
