import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import storageRouter from './routes/storage.js';
import { ensureDir, ensureFile } from './utils/fs.js';

async function bootstrap() {
  await ensureDir(config.dataDir);
  await ensureFile(config.appStorageFile, '{}\n');
  await ensureFile(
    config.usersCsvFile,
    'id,name,group,isHR,avatar,stravaConnected,weekKms,maxW,todayDone\n'
  );
}

async function main() {
  await bootstrap();

  const app = express();
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', storageRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(config.port, () => {
    console.log(`TrackFlow server listening on http://localhost:${config.port}`);
    console.log(`Users CSV: ${config.usersCsvFile}`);
    console.log(`App storage: ${config.appStorageFile}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
