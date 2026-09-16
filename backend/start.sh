#!/bin/sh
set -eu
if [ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET}" = "change-me" ]; then
  echo 'Set a persistent, random JWT_SECRET before starting.' >&2
  exit 1
fi
mkdir -p "$(dirname "$DATABASE_PATH")" "$ECG_STORAGE_DIR"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
