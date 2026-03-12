import { config } from './config.js';
import { buildTrackFlowApp } from './app.js';

async function main() {
  const { app, storageProvider, isLocalMode } = await buildTrackFlowApp();

  app.listen(config.port, () => {
    console.log(`TrackFlow server listening on http://localhost:${config.port}`);
    console.log(`Storage provider: ${storageProvider.name}`);
    if (isLocalMode) {
      console.log(`Users CSV: ${config.usersCsvFile}`);
      console.log(`App storage: ${config.appStorageFile}`);
      return;
    }
    console.log(`Supabase URL: ${config.supabaseUrl}`);
    console.log(`Supabase schema/table: ${config.supabaseSchema}.${config.supabaseKvTable}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
