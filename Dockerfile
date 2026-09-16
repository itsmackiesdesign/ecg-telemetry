FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY hooks ./hooks
COPY public ./public
COPY vendor ./vendor
COPY index.html railway-entry.tsx vite.railway.config.ts tsconfig.json postcss.config.mjs ./
RUN npx vite build --config vite.railway.config.ts

FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    DATABASE_PATH=/data/pulsepoint.db ECG_STORAGE_DIR=/data/storage \
    FRONTEND_DIST=/app/frontend PORT=8000
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /build/dist-railway ./frontend
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /data
EXPOSE 8000
CMD ["./start.sh"]
