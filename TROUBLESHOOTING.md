# Troubleshooting

- **PowerShell activation is blocked:** use `.\.venv\Scripts\python.exe -m pip ...` and `.\.venv\Scripts\python.exe -m uvicorn ...` instead of activating the environment.
- **Frontend cannot reach API:** ensure Uvicorn is listening on `127.0.0.1:8000`; check browser console and `CORS_ORIGINS`.
- **Upload rejected:** only UTF-8 `.txt`, `.md`, and `.vtt` files up to 2 MB are accepted. Ensure the file contains at least one non-empty text line.
- **No Q&A evidence:** local Q&A is lexical matching rather than semantic retrieval. Try words that appear in the transcript. It will prefer an explicit insufficient-evidence response over an unsupported answer.
- **Data seems missing:** the default database is `echolens.db` at the repository root. A different `DATABASE_URL` points to a different store.
- **Port already in use:** choose a free Uvicorn port and update the frontend API URL/CORS configuration accordingly.
