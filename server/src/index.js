import { config } from './config.js';
import { buildTrackFlowApp } from './app.js';

async function main() {
  const { app, storageProvider } = await buildTrackFlowApp();

  app.listen(config.port, () => {
    console.log(`TrackFlow server listening on http://localhost:${config.port}`);
    console.log(`Storage provider: ${storageProvider.name}`);
    console.log(`Mongo DB: ${config.mongoDbName}`);
    console.log(`Mongo default coach: ${config.defaultCoachId}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
