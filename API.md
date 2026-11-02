# API reference

Base URL: `http://127.0.0.1:8000`

Interactive OpenAPI docs: `/docs`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health and local mode |
| GET | `/api/meetings` | List meetings |
| POST | `/api/meetings` | Create from transcript text JSON |
| POST | `/api/meetings/import?title=...` | Multipart TXT/MD/VTT import, optional `meeting_date` |
| POST | `/api/meetings/audio/import?title=...` | Optional local WAV/MP3/M4A speech-to-text import |
| GET | `/api/meetings/{id}` | Meeting, segments, summary, decisions, action items |
| PATCH | `/api/meetings/{id}` | Update meeting title and/or date |
| DELETE | `/api/meetings/{id}` | Delete meeting and associated records |
| POST | `/api/meetings/{id}/summary` | Recompute deterministic summary |
| POST | `/api/meetings/{id}/actions` | Re-extract action items with evidence |
| POST | `/api/meetings/{id}/decisions` | Re-extract decisions with evidence |
| POST | `/api/meetings/{id}/ask` | Evidence-grounded meeting Q&A; `mode` is `local` or `live_ai` |
| POST | `/api/ask` | Cross-meeting evidence retrieval with optional `meeting_ids`, `date_from`, and `date_to` |
| POST | `/api/meetings/{id}/inspect` | Inspect JSON `{ "claim": "..." }` |
| GET | `/api/search?q=...` | Search meeting titles/transcripts; optional `meeting_id`, `date_from`, `date_to`, `sort_by=recent|title` |
| GET | `/api/actions` | List/filter persistent action items across meetings |
| GET | `/api/actions/export.csv` | Download up to 500 workspace action items as CSV |
| PATCH | `/api/actions/{id}` | Edit task, owner, due date, or status |
| GET | `/api/analytics` | Evidence-derived topic, participation, timing, blocker, and open-question data |
| GET | `/api/meetings/{id}/export/{format}` | `markdown`, `txt`, or `csv` export |
| POST | `/api/demo/seed` | Add bundled demo meetings idempotently |
| GET | `/api/settings/provider` | Mode and provider configuration status |

Existing meeting endpoints retain their response fields; added response metadata is additive. Validation errors return HTTP 422 with a descriptive `detail`; missing records return 404. Search and analytics date ranges use ISO `YYYY-MM-DD` dates. Transcript uploads are capped at 2 MB (`.txt`, `.md`, `.vtt`). Optional audio uploads are capped at 25 MB and two hours, require the separately installed speech-to-text dependencies, and do not identify speakers.

Q&A accepts a JSON body such as:

```json
{
  "question": "Who will send the release plan?",
  "mode": "local",
  "allow_external_processing": false
}
```

`/api/ask` also accepts `meeting_ids` (up to 50 IDs), `date_from`, and `date_to`. An empty meeting ID list means all meetings in the date range. Evidence results include the meeting title, speaker, timestamp, exact excerpt, and segment ID.

Live Q&A is only attempted when `LIVE_AI_ENABLED=true`, a backend `GEMINI_API_KEY` exists, the request selects `mode: "live_ai"`, and `allow_external_processing: true` is sent. The question and retrieved excerpts are then sent to Google Gemini; the response identifies whether live AI or local fallback was used. Otherwise requests remain local. The key is never returned by `/api/settings/provider`.

Action updates accept only supplied fields: `task`, `owner`, `due_date`, and `status` (`pending`, `open`, or `completed`). Overdue is derived from a past ISO date on an open action. The existing per-meeting CSV export is unchanged; the global action export is additive.

`/api/analytics` reports speaker participation, topics, topic-by-meeting trends, exact repeated blocker text, and unresolved questions with evidence. Speaking time is reported only when all relevant segments include both a speaker and duration; otherwise the response includes an unavailable reason.
