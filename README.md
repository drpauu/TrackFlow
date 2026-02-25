# TrackFlow (Proyecto GitHub completo)

Proyecto web **frontend + backend** para TrackFlow, basado en tu `trackflow.jsx` mejorado:
- UI React (Vite)
- **Registro de usuarios en CSV real** (archivo en `server/data/users.csv`)
- Persistencia del resto de datos (semana, rutinas, notificaciones, etc.) en `server/data/app_storage.json`
- Base de datos hardcodeada del Excel `PESAS2024` incluida en frontend (`src/data/pesas2024_hardcoded_db.js`)

## Estructura

- `frontend/` → app React (Vite)
- `server/` → API Express para almacenamiento (`window.storage` compatible)
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

## Cómo funciona el CSV

La app usa un **shim** de `window.storage` en el frontend.
- Cuando la key es `tf_users_csv`, el backend lee/escribe `server/data/users.csv`.
- El resto de keys se guardan como strings en `server/data/app_storage.json`.

Así mantienes el requisito de “registro de usuarios en CSV” sin tocar una base de datos SQL.

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
- Pensado para desarrollo local y despliegue sencillo.
- Para producción real, te recomendaría migrar autenticación y persistencia a una API con roles/autorización.
