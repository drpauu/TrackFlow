# TrackFlow

TrackFlow es una app React (Vite) + API Express con persistencia en **MongoDB** como fuente unica de datos.

## Estado actual (marzo 2026)

- Frontend: `frontend/` (React + Vite)
- Backend/API: `server/` (Express)
- Deploy: Vercel (`frontend` estatico + `/api/*` serverless)
- Persistencia activa: MongoDB
- Compatibilidad UI actual: se mantiene contrato `tf_*` via `state_cache`

## Arquitectura de datos (Mongo)

### Capa canonica

- `users`
- `groups`
- `athletes`
- `gym_exercises`
- `trainings`
- `seasons`
- `week_plans`
- `athlete_day_plans`
- `athlete_day_status`
- `competitions`

### Capa de compatibilidad

- `state_cache`:
  - guarda claves `tf_*` usadas por la UI actual
  - cada cambio incrementa `syncVersion`
- `sync_counters`:
  - contador monotono por `coachId`

## Flujo de escritura y sync incremental

1. UI escribe en `PUT /api/storage/:key` (clave `tf_*`).
2. Se actualiza `state_cache` y sube `syncVersion`.
3. Se proyecta a modelo canonico (colecciones Mongo).
4. Clientes hacen polling de `GET /api/storage/changes?since=<n>`.
5. Si hay cambios, refrescan solo claves afectadas.

Respuesta de cambios:

- `latestSeq` (compat legacy)
- `latestSyncVersion` (nuevo)
- `changes[]` con `{ key, syncVersion, changedAt }`

## Reglas de negocio implementadas

- Multi-tenant estricto por `coachId`.
- Sin historico de versiones: siempre se mantiene estado actual.
- Publicar semana:
  - `week_plans.status = published`
  - refresco de `tf_week_plans` en `state_cache`
  - recomputo de `athlete_day_plans` y `athlete_day_status`
- Color del calendario atleta:
  - futuro: `gray`
  - sin plan: `green` (descanso)
  - plan con 0 completados: `red`
  - parcial: `orange`
  - completo: `green`

## Auth propia (Mongo)

Endpoints:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Detalles:

- password persistida en texto plano por decision actual del producto
- sesion con token firmado HS256 en cookie `HttpOnly`
- roles: `coach` y `athlete`
- rate limit basico en login
- activacion via `MONGO_REQUIRE_AUTH=true`

## Variables de entorno

### Minimas para Mongo (server)

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB=track-flow-db
DEFAULT_COACH_ID=juancarlos
APP_TIMEZONE=Europe/Madrid
```

### Auth (recomendado)

```bash
MONGO_REQUIRE_AUTH=true
AUTH_JWT_SECRET=change_this_super_secret
AUTH_JWT_TTL_SEC=1209600
AUTH_COOKIE_NAME=tf_session
AUTH_COOKIE_SAMESITE=Lax
AUTH_COOKIE_SECURE=true
CRON_SECRET=change_this_cron_secret
JOGATINA_ENABLED=true
CORS_ORIGINS=https://track-flow-frontend.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

### Frontend

```bash
VITE_STORAGE_MODE=api
VITE_STORAGE_SYNC_INTERVAL_MS=2500
VITE_STORAGE_SYNC_LIMIT=200
```

En produccion en Vercel no definas `VITE_API_BASE_URL`.
La app publica debe consumir `/api/*` en el mismo origen (`https://track-flow-frontend.vercel.app`).

## Migracion unica a Mongo (cutover)

1. Verificar variables (`MONGODB_URI`, `MONGODB_DB`).
2. Dry run:

```bash
npm run migrate:mongo -- --dry-run
```

3. Ejecutar migracion:

```bash
npm run migrate:mongo
```

Opcionales:

- `--from-seeds` para usar `server/data/seeds`
- `--coach-id=<id>` para migrar a otro tenant

El script migra `tf_*` -> `state_cache` y proyecta a colecciones canonicas. Al final imprime conteos por entidad.

## Desarrollo local

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`
- Health: `GET /api/health`

## Build

```bash
npm run build --workspace frontend
```

## Deploy en Vercel

TrackFlow esta preparado para desplegarse como un unico proyecto Vercel:

- frontend estatico servido desde `frontend/dist`
- API Express serverless en `api/index.mjs`
- rewrites `same-origin` para que el frontend llame a `/api/*`

### Variables recomendadas en Produccion

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB=track-flow-db
MONGO_REQUIRE_AUTH=true
DEFAULT_COACH_ID=juancarlos
APP_TIMEZONE=Europe/Madrid
AUTH_JWT_SECRET=change_this_super_secret
AUTH_JWT_TTL_SEC=1209600
AUTH_COOKIE_NAME=tf_session
AUTH_COOKIE_SAMESITE=Lax
AUTH_COOKIE_SECURE=true
CRON_SECRET=change_this_cron_secret
JOGATINA_ENABLED=true
CORS_ORIGINS=https://track-flow-frontend.vercel.app,http://localhost:5173,http://127.0.0.1:5173
VITE_STORAGE_MODE=api
```

### Pasos

1. Importar el repo en Vercel.
2. Mantener el proyecto como un solo deploy, sin backend separado.
3. Definir las variables de entorno anteriores.
4. No definir `VITE_API_BASE_URL` en produccion.
5. Build command: `npm run build`
6. Output directory: `frontend/dist`
7. Verificar en produccion:
   - `GET /api/health`
   - login `POST /api/auth/login`
   - `GET /api/auth/me` tras refrescar
   - escrituras reales en Mongo Atlas

### Notas de runtime

- `vercel.json` ya incluye `fluid` y una cron diaria para `/api/jogatina/cron/run`.
- Jogatina usa SSE y el navegador reconecta automaticamente cuando Vercel cierra la funcion.
- El deploy publico no depende del PC local ni de `npm run dev`.

## Notas de compatibilidad

- La UI actual sigue leyendo/escribiendo `tf_*`.
- No hace falta reescribir pantallas para activar Mongo.
- `VITE_STORAGE_MODE` ahora usa `api` por defecto (Mongo).
