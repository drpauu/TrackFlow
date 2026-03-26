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

function normalizeOrigin(origin) {
  const raw = String(origin || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function validateRuntimeConfig() {
  if (config.nodeEnv === 'production' && config.mongoRequireAuth === true && !String(config.authJwtSecret || '').trim()) {
    throw new Error('AUTH_JWT_SECRET es obligatorio en producción cuando MONGO_REQUIRE_AUTH=true.');
  }
}

export async function buildTrackFlowApp() {
  validateRuntimeConfig();
  const storageProvider = createStorageProvider();
  await storageProvider.init();

  const app = express();
  app.disable('x-powered-by');
  const allowedOrigins = new Set((config.corsOrigins || []).map((origin) => normalizeOrigin(origin)).filter(Boolean));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (isLocalDevOrigin(normalizedOrigin)) return callback(null, true);
      if (!allowedOrigins.size || allowedOrigins.has(normalizedOrigin)) return callback(null, true);
      return callback(new Error(`CORS origin no permitido: ${normalizedOrigin}`));
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
