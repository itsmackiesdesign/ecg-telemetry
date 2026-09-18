# Railway: ЭКГ телеметрия

Один Docker-контейнер: FastAPI + статический React frontend + PWA. Cloudflare/D1/Supabase для этого варианта не нужны. Локальный Vinext dev-режим остаётся доступен.

## Деплой

1. Загрузите исходники в GitHub. В Railway создайте проект **Deploy from GitHub repo**.
2. Root Directory — корень репозитория, не `backend`. Railway использует корневой `Dockerfile` и `railway.json`. Не задавайте отдельные Build/Start команды.
3. До первого запуска добавьте Volume с Mount Path `/data`. Хранятся `/data/pulsepoint.db` и `/data/storage/`.
4. В Variables добавьте:

   ```env
   OPENAI_API_KEY=ваш_ключ
   OPENAI_MODEL=gpt-4o-mini
   JWT_SECRET=постоянная_случайная_строка
   ```

   Сгенерировать JWT_SECRET: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. Не меняйте его при каждом деплое. Без него контейнер намеренно не стартует.
5. Deploy → Networking → Generate Domain. Приложение слушает `0.0.0.0:$PORT` (по умолчанию 8000). Healthcheck — `/health`.
6. Откройте HTTPS-домен, зарегистрируйте врача и менеджера. API и frontend имеют общий домен: отдельный CORS и `NEXT_PUBLIC_API_URL` не нужны. Установите PWA через браузер телефона.

Используйте одну реплику: SQLite и файлы привязаны к одному тому. Настройте резервные копии тома. Не удаляйте Volume при обновлении приложения.

## Существующие данные

Docker не содержит `.env`, ключей, локальной SQLite или ЭКГ. Новый Volume означает новую пустую базу: локальные пользователи и пять центров автоматически не переносятся. Чтобы сохранить их, перенесите согласованную копию `backend/pulsepoint.db` (через SQLite backup) и `backend/storage/` в `/data` на остановленный сервис. Не кладите реальные медицинские данные в Git или Docker image. Затем запустите сервис и войдите заново.

## Локальный Docker

Из корня репозитория:

```sh
docker build -t ecg-telemetry .
docker run --rm -p 8000:8000 --env-file backend/.env \
  -e JWT_SECRET="$JWT_SECRET" -v ecg-data:/data ecg-telemetry
```

Предварительно задайте JWT_SECRET. Откройте http://localhost:8000. Тот же именованный том `ecg-data` сохраняет данные между запусками.

## Проверки

- Production frontend: `npm run build:railway`.
- Backend: `cd backend && .venv/bin/python -m unittest discover -s tests -v`.
- Статические файлы монтируются после API и не обходят авторизацию.
- Ошибка OpenAI `provider_configuration` означает проблему ключа/доступа; `rate_limited` — лимит провайдера.

Проверены локальная production-сборка, раздача frontend через FastAPI, health, manifest, icons, авторизация API и backend-тесты. Сам Docker image локально не запускался: Docker CLI отсутствует.

Документация Railway: https://docs.railway.com/builds/dockerfiles, https://docs.railway.com/volumes, https://docs.railway.com/deployments/healthchecks.

### Driving routes and arrival estimates

The backend calls OSRM with the doctor's browser coordinates and the center's
saved latitude/longitude. It sends no patient names, notes or ECGs to OSRM.
`ROUTING_BASE_URL` defaults to `https://router.project-osrm.org` (public demo).
For a production deployment, set this variable to a dedicated OSRM driving
instance: the public demo has no availability guarantee. No routing API key is
required by the default service. Browser geolocation requires HTTPS (or localhost)
and user permission.

Travel time excludes live traffic and ambulance-specific driving privileges.
Handover ETA assumes departure when the handover is sent. Managers see a local
countdown from the stored arrival timestamp, not live vehicle tracking. Route
quotes expire after 10 minutes; the interface requests recalculation after 9.
Existing handovers and transfers without a route show no ETA. Route failures never
produce a guessed straight-line driving time or block a transfer without ETA.
