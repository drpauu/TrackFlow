import { Suspense, lazy } from 'react';

const TrackFlow = lazy(() => import('./features/trackflow/TrackFlow.jsx'));

export default function App() {
  return (
    <Suspense
      fallback={(
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#080811', color: '#F0F0FA', fontFamily: 'sans-serif' }}>
          Cargando TrackFlow...
        </div>
      )}
    >
      <TrackFlow />
    </Suspense>
  );
}
