# PulsePoint FastAPI

All active frontend data requests use FastAPI. SQLite and ECG files persist locally.

## Start

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Set `OPENAI_API_KEY` in `backend/.env`. Optional: `OPENAI_MODEL` (default `gpt-4o-mini`), `DATABASE_PATH`, `ECG_STORAGE_DIR`, `JWT_SECRET`, `CORS_ORIGINS` (comma separated exact frontend origins).
Default SQLite path is backend/pulsepoint.db regardless of working directory. Existing SQLite accounts are retained. A local signing secret is generated once if not configured. Back up the database, storage directory, and signing secret together.

Frontend: `npm run dev -- --host 127.0.0.1 --port 5174` with Node >=22. Set `NEXT_PUBLIC_API_URL` before building to use a deployed HTTPS API. Local default is http://127.0.0.1:8000. Restart after changing environment variables.

A hosted frontend cannot use this machine's localhost for other users: deploy FastAPI separately with persistent storage and configure its HTTPS URL and CORS. This local migration does not update the old hosted Site.

## Features

Bearer auth with revocable logout; SQLite users, centers, handovers and assessments; manager ownership; protected ECG files; multipart image validation and limits; strict structured GPT results and clinical guardrails; provider error mapping. GPT results save automatically, clinician assessments use Save assessment. Case history shows saved cases and ECGs. Managers see only their center accounts and incoming cases.

## Test

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Integration tests use temporary SQLite and mocked OpenAI (no patient data or API charges). They cover roles, ownership, statuses, transfer, history, logout, multipart context, schema and clinical guardrails. Software tests are not clinical validation.

### Diagnosing analysis failures

The frontend distinguishes `provider_configuration` (key/model access),
`provider_request_rejected` (request/model incompatibility), `provider_quota`
(billing quota), `provider_connection` (network), `timeout`, and
`provider_unavailable` (upstream service failure). In Railway deployment logs,
search for `analysis_provider_error`. It includes the provider status, error
code, parameter and request ID, without logging the ECG, patient context,
API key or provider message. Check the deployed `OPENAI_MODEL` and credentials:
local `.env` settings are not automatically copied to Railway.

Analysis uses an 85-second upstream timeout without automatic retries so errors
can return before the frontend's 100-second deadline.
