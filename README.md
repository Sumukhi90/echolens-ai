# EchoLens AI

EchoLens is a local-first conversation intelligence workspace built with Next.js, TypeScript, FastAPI, and SQLite. Import transcripts, explore evidence-linked notes and action items, search or ask across meetings, inspect claims, and export your data.

## What works

- **Demo and local modes:** no credentials or hosted services required. Import TXT, Markdown, or WebVTT. Optional WAV, MP3, and M4A transcription requires separately installed local audio dependencies and a model; text import remains independent of them.
- **Deterministic analysis:** meeting topics, discussion points, tentative/confirmed decisions, follow-ups, unresolved questions, and risks are extracted locally. Owners and due dates are not inferred unless explicit.
- **Evidence retrieval:** local keyword retrieval is always available. Optional FastEmbed vectors provide local semantic retrieval and are cached in SQLite; no external vector database is used.
- **Optional live answers:** the server-side Gemini adapter validates structured answers and restricts citations to retrieved transcript segments. Live-provider behavior has only been tested with mocked requests; it requires a server-side key and explicit per-request consent. Consented requests send the question and retrieved excerpts to Google Gemini.
- **Task tracking and analytics:** edit tasks, owners, due-date text, and status; inspect overdue/repeated tasks and export a workspace CSV. Analytics report source-derived participation, timed speaking duration when available, topics, repeated blockers, unresolved questions, and topic trends.
- **Reliability and exports:** the claim inspector remains a heuristic review aid. Meeting exports include Markdown, text, and CSV.

## Requirements

- Python 3.11 or newer
- Node.js 20.9 or newer and npm
- Windows PowerShell, macOS, or Linux

## Run on Windows PowerShell

From the project root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements-lock.txt
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

In a second PowerShell window:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. API documentation is at <http://127.0.0.1:8000/docs>. By default, SQLite is stored in `echolens.db` at the project root and survives restarts. The app binds to localhost; it has no authentication and must not be exposed to untrusted networks.

If PowerShell prevents venv activation, run `.\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt` and start Uvicorn using `.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000`.

## Optional capabilities

### Local semantic retrieval

Install the extra from the project root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-ai.txt
```

Set `LOCAL_EMBEDDINGS_ENABLED=true` and optionally `LOCAL_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5` in the backend environment (or root `.env`), then restart the API. FastEmbed downloads the model on first use; the downloaded model runs locally. If unavailable, EchoLens uses its keyword fallback.

### Live Gemini answers

In the root `.env`, set `GEMINI_API_KEY` and `LIVE_AI_ENABLED=true`. Keep the key server-side; never add it to a `NEXT_PUBLIC_*` variable. Select Live AI in an Ask view and check the external-processing consent box to send only retrieved excerpts and the question to Google Gemini. Without both server configuration and per-request consent, Demo and Local modes continue to work without external calls.

### Local audio transcription

Install the optional audio dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-audio.txt
```

The default Faster-Whisper `base` model downloads on first use. Transcription runs on CPU locally and accepts WAV/MP3/M4A up to 25 MB and two hours. First use may take time. Speaker identification/diarization is not available. If dependencies are not installed, normal transcript import still works.

Audio upload and timestamp handling have automated tests using a fake transcriber. Real speech-recognition quality and model downloads have not been validated as part of the automated checks.

## Tests, build, and measured evaluation

From the project root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
Set-Location frontend
npm test
npm run build
Set-Location ..
Set-Location backend
..\.venv\Scripts\python.exe -m app.evaluation
```

The six-case authored regression set was executed against local keyword retrieval and deterministic extraction: retrieval hit@5 1.00, citation precision 1.00, unsupported-citation rate 0.00, abstention accuracy 1.00, action extraction precision/recall/F1 1.00, explicit-owner accuracy 1.00, decision-classification precision/recall/F1 1.00, and prompt-injection abstention 1.00. These results are for a small hand-authored regression set, not a representative benchmark or accuracy claim. The actual BGE small local embedding model was downloaded and smoke-tested; see [TESTING.md](./TESTING.md).

## Known limitations

- The application has no authentication or authorization. Keep the API bound to localhost; it is not safe for public or shared-network deployment.
- The frontend has component tests but no automated browser end-to-end suite. In the latest local audit, the dashboard rendered, but navigation/import interactions could not be completed in the browser, and the development server repeatedly reported HMR WebSocket handshake errors. The production build and component tests passed; browser workflow behavior needs a follow-up check.
- Live Gemini requests and real audio transcription have not been verified against external/provider services or real audio. Semantic retrieval is optional and keyword retrieval remains the default.
- No screenshots are currently included in the repository.

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md), [BUILD_PLAN.md](./BUILD_PLAN.md), [BUILD_STATUS.md](./BUILD_STATUS.md), [API.md](./API.md), [DATA_MODEL.md](./DATA_MODEL.md), [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md), [TESTING.md](./TESTING.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [CHANGELOG.md](./CHANGELOG.md), and [TEST_AUDIT_REPORT.md](./TEST_AUDIT_REPORT.md).
