# TrackFlow (Proyecto GitHub completo)

Proyecto web **frontend + backend** para TrackFlow:
- UI React (Vite)
- Backend Express con capa de almacenamiento intercambiable:
  - `local` (archivos en `server/data`)
  - `supabase` (proyecto único, recomendado)
- Sincronización entre clientes (coach/atletas) vía feed de cambios (`/api/storage/changes`)
- Base de datos hardcodeada del Excel `PESAS2024` incluida en frontend (`src/data/pesas2024_hardcoded_db.js`)

## Estructura

- `frontend/` → app React (Vite)
- `server/` → API Express para almacenamiento (`window.storage` compatible)
- `server/sql/supabase_schema.sql` → esquema SQL completo para Supabase (operativo + modelo normalizado)
- `.github/workflows/` → CI básica de build

## Requisitos

- Node.js 20+
- npm 10+

## Arranque local

```bash
npm install
npm run dev
```

Esto levanta:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## Modo local (por defecto)

La app usa un **shim** de `window.storage` en el frontend.
- Cuando la key es `tf_users_csv`, el backend lee/escribe `server/data/users.csv`.
- El resto de keys se guardan como strings en `server/data/app_storage.json`.

## Modo Supabase (proyecto único)

1. Crea un proyecto en Supabase.
2. Ejecuta en SQL Editor: [`server/sql/supabase_schema.sql`](server/sql/supabase_schema.sql)
3. Configura `server/.env` (puedes copiar `server/.env.example`):

```bash
PORT=8787
CORS_ORIGIN=http://localhost:5173
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_SCHEMA=public
SUPABASE_KV_TABLE=app_kv
SUPABASE_USERS_TABLE=users_csv_registry
SUPABASE_CHANGES_TABLE=app_changes
SUPABASE_REQUEST_TIMEOUT_MS=12000
```

4. (Opcional) Configura `frontend/.env`:

```bash
VITE_API_BASE_URL=
VITE_STORAGE_SYNC_INTERVAL_MS=2500
VITE_STORAGE_SYNC_LIMIT=200
```

Notas:
- El backend migrará automáticamente datos locales (`app_storage.json` + `users.csv`) a Supabase si las tablas están vacías.
- Se usa **un único proyecto Supabase** (sin pre/pro).
- Las imágenes de ejercicios quedan soportadas mediante bucket `exercise-images` (creado por el SQL).
- La sincronización es casi en tiempo real por polling corto del feed de cambios.

## Scripts

```bash
npm run dev          # frontend + backend
npm run dev:frontend # solo frontend
npm run dev:server   # solo backend
npm run build        # build frontend
npm run start        # arranca backend (producción API)
```

## Notas

- Autenticación actual: mock/simple (como en el componente original).
- Persistencia 100% centralizable en Supabase manteniendo compatibilidad de datos legacy.
