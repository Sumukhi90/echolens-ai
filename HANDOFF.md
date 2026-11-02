# Handoff

## Start here

Use the two PowerShell windows described in [README.md](./README.md): start FastAPI on port 8000, then Next.js on port 3000. Load the sample meetings from the empty dashboard to explore the workflow.

## Important implementation notes

- Local operation does not require cloud services. If a user enables Live AI, selects that mode, and explicitly consents, the question and retrieved transcript excerpts are sent to Google Gemini.
- Local analysis is deterministic. Do not describe it as LLM output.
- Meeting summary and action/decision evidence points back to parsed transcript segments.
- SQLite persistence is configured at repository-root `echolens.db`; the database is intentionally ignored by Git.
- Live AI is optional and requires a server-side Gemini key; the frontend never receives secret values. Live provider requests have only been tested with mocked responses.
- Optional audio transcription uses local Faster-Whisper/PyAV dependencies and a downloaded model. Audio transcription quality and speaker diarization have not been verified/implemented, respectively.
- There is no authentication or authorization. Keep the API bound to localhost.
- The latest browser audit found that the dashboard rendered, but navigation/import interactions could not be completed and development HMR WebSocket handshakes failed. Recheck browser workflows before demonstrating the app.

## Checks

See [BUILD_STATUS.md](./BUILD_STATUS.md) for delivered scope and limitations, and [TESTING.md](./TESTING.md) for executable checks.
