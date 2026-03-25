import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import createStorageRouter from './routes/storage.js';
import createAuthRouter from './routes/auth.js';
import createDomainRouter from './routes/domain.js';
import createJogatinaRouter from './routes/jogatina.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { createStorageProvider } from './storage/provider.js';

function isLocalDevOrigin(origin) {
  try {
    const parsed = new URL(String(origin || ''));
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function buildTrackFlowApp() {
  const storageProvider = createStorageProvider();
  await storageProvider.init();

  const app = express();
  app.disable('x-powered-by');
  const allowedOrigins = new Set((config.corsOrigins || []).map((origin) => String(origin || '').trim()).filter(Boolean));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isLocalDevOrigin(origin)) return callback(null, true);
      if (!allowedOrigins.size || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS origin no permitido: ${origin}`));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(attachRequestContext);

  app.get('/api/debug-config', (_req, res) => res.json({
    providerName: storageProvider?.name,
    hasMongoUri: !!config.mongoUri,
    mongoDbName: config.mongoDbName,
  }));

  app.use('/api', createStorageRouter({ storage: storageProvider }));
  app.use('/api/auth', createAuthRouter({ storage: storageProvider }));
  app.use('/api', createDomainRouter({ storage: storageProvider }));
  app.use('/api/jogatina', createJogatinaRouter({ storage: storageProvider }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    const statusCode = Number(err?.statusCode || 500);
    res.status(statusCode).json({ error: err?.message || 'Internal server error' });
  });

  return { app, storageProvider };
}

let serverlessAppPromise = null;

export function getServerlessTrackFlowApp() {
  if (!serverlessAppPromise) {
    serverlessAppPromise = buildTrackFlowApp();
  }
  return serverlessAppPromise;
}
