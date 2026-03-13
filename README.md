# TrackFlow

TrackFlow es una app React (Vite) con persistencia centralizada en Supabase.

La persistencia de negocio actual se modela por slices `tf_*` y ahora se guarda en Postgres (`public.app_kv`) con:
- RLS (solo entrenador/admin escribe)
- Realtime (`postgres_changes`) para que todos los clientes vean cambios al instante
- resolución determinista de eventos con `version` + `updated_at` (last write wins)

## Stack detectado

- Frontend: React 18 + Vite (`frontend/`)
- Backend legacy: Express (`server/`) para modo antiguo API/polling
- Supabase:
  - SQL: [`supabase/migrations/20260312220749_trackflow_init.sql`](supabase/migrations/20260312220749_trackflow_init.sql)
  - SQL espejo: [`server/sql/supabase_schema.sql`](server/sql/supabase_schema.sql)

## Mapa UI -> operación de datos -> efecto esperado

| UI / acción | Operación de datos | Efecto |
|---|---|---|
| Editar semana, sesiones AM/PM, gym, asignaciones | `upsert app_kv(key='tf_week_plans'/'tf_week', value=...)` | Plan guardado y visible en todos los clientes |
| Publicar/modificar semana | `upsert app_kv(key='tf_week_plans')` + `upsert app_kv(key='tf_athlete_notifs')` | Semana publicada/actualizada y notificaciones sincronizadas |
| Guardar rutinas | `upsert app_kv(key='tf_routines')` | Biblioteca de rutinas compartida |
| Guardar dataset entrenos | `upsert app_kv(key='tf_trainings')` | Dataset compartido en tiempo real |
| Crear/editar/eliminar atleta, contraseña, grupos | `upsert app_kv(key='tf_athletes')` + `upsert app_kv(key='tf_users_csv')` + `upsert app_kv(key='tf_groups')` | Catálogo de atletas consistente |
| Añadir/eliminar competiciones de atleta | `upsert app_kv(key='tf_athletes')` | Calendario de competición sincronizado |
| Finalizar temporada | `upsert app_kv(keys='tf_seasons','tf_current_season_id','tf_season_week_one_start',...)` | Cierre y arranque de temporada consistente |
| Guardar historial/check diario | `upsert app_kv(key='tf_history')` | Historial compartido |
| Guardar calendario semanal | `upsert app_kv(key='tf_calendar_weeks')` | Calendario compartido |
| Guardar ejercicios personalizados e imágenes | `upsert app_kv(key='tf_custom_exercises'/'tf_exercise_images')` | Dataset gym sincronizado |
| Eliminar una key (operación DAL) | `delete app_kv where key = ...` | Key eliminada en todos los clientes |
| Login actual de sesión | `localStorage key='tf_user'` (privada/local) | No se comparte entre clientes |

## Esquema de base de datos (Supabase / Postgres)

Modelo persistente en `public`:

- `app_profiles`
  - `id uuid` (FK a `auth.users`)
  - `is_admin boolean` (entrenador admin supremo)
  - `email`, `display_name`, timestamps
- `app_kv`
  - `key text PK`
  - `value text`
  - `is_public boolean`
  - `position integer` (soporte orden manual estable)
  - `version bigint` (incremental por trigger)
  - `updated_at`, `updated_by`, timestamps

Índices principales:
- `idx_app_kv_public_updated (is_public, updated_at desc)`
- `idx_app_kv_position (position) where position is not null`
- `idx_app_kv_updated_by (updated_by, updated_at desc)`

SQL listo:
- [`supabase/migrations/20260312220749_trackflow_init.sql`](supabase/migrations/20260312220749_trackflow_init.sql)
- [`server/sql/supabase_schema.sql`](server/sql/supabase_schema.sql)

## Seguridad (RLS)

Políticas activas:

- Lectura:
  - `anon/authenticated`: pueden leer `app_kv` donde `is_public = true`
  - admin: puede leer todo
- Escritura:
  - `insert/update/delete` en `app_kv`: solo `authenticated` con `public.is_admin_user() = true`

Mecanismo de rol implementado: **Opción B** (`app_profiles.is_admin` + `auth.uid()`).

## Realtime global

Frontend suscrito a `postgres_changes` sobre `public.app_kv`:

- `INSERT`: inserta/actualiza local si evento es más nuevo
- `UPDATE`: reemplaza por `key` si evento es más nuevo
- `DELETE`: elimina por `key` si evento es más nuevo

Control anti-eventos fuera de orden:
- se compara `version` (prioridad)
- desempate por `updated_at`

## Capa de datos en frontend

Archivos nuevos/actualizados:

- [`frontend/src/lib/supabaseClient.js`](frontend/src/lib/supabaseClient.js)
  - cliente único Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [`frontend/src/lib/trackflowRepository.js`](frontend/src/lib/trackflowRepository.js)
  - DAL: `list/get/create/update/upsert/delete` + auth admin + suscripción realtime
- [`frontend/src/lib/storageClient.js`](frontend/src/lib/storageClient.js)
  - shim `window.storage` migrado a Supabase (con fallback legacy API)
  - `tf_user` se mantiene local/privado

## Variables de entorno

Referencia: [`.env.example`](.env.example)

Mínimas:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_ADMIN_EMAIL=coach@example.com
```

Opcional server-only:

```bash
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

No exponer `SUPABASE_SERVICE_ROLE_KEY` en cliente.

## Arranque local

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend legacy API: `http://localhost:8787`

## Preparación Supabase (una vez)

1. Ejecuta SQL del esquema:
   - `supabase/migrations/20260312220749_trackflow_init.sql`
2. Crea usuario entrenador en Supabase Auth (email/password).
3. Marca entrenador como admin:

```sql
insert into public.app_profiles (id, email, display_name, is_admin)
values ('<AUTH_USER_ID>', 'coach@example.com', 'Entrenador', true)
on conflict (id) do update
set is_admin = true,
    email = excluded.email,
    display_name = excluded.display_name;
```

## Despliegue en Vercel

1. Importa el repo en Vercel.
2. Configura variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_ADMIN_EMAIL`
3. Build command: `npm run build`
4. Output directory: `frontend/dist`

`vercel.json` ya está preparado para SPA y ruta `/api/*`.

## Verificación rápida

1. Abre dos navegadores/sesiones.
2. Entra como entrenador en una sesión.
3. Modifica semana/rutina/atletas y guarda.
4. Verifica que la otra sesión recibe actualización en directo sin recargar manualmente.

